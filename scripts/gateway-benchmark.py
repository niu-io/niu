#!/usr/bin/env python3
"""Measure an OpenAI-compatible chat endpoint with a dependency-free load client."""

from __future__ import annotations

import argparse
import collections
import concurrent.futures
import datetime as dt
import http.client
import json
import math
import os
import platform
import queue
import ssl
import sys
import threading
import time
from dataclasses import dataclass, field
from urllib.parse import urlsplit


@dataclass
class WorkerResult:
    latencies_ms: list[float] = field(default_factory=list)
    start_lag_ms: list[float] = field(default_factory=list)
    status_counts: collections.Counter[str] = field(default_factory=collections.Counter)
    errors: collections.Counter[str] = field(default_factory=collections.Counter)
    started: int = 0
    late_drops: int = 0


class RunState:
    def __init__(self, mode: str, duration: float, rate: float | None) -> None:
        self.mode = mode
        self.duration = duration
        self.rate = rate
        self.started_at = 0.0
        self.late_drops = 0


def endpoint_parts(value: str) -> tuple[str, str, int, str, bool]:
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("endpoint must be an absolute http:// or https:// URL")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("credentials in the endpoint URL are not allowed")
    if parsed.query or parsed.fragment:
        raise ValueError("query strings and fragments are not allowed in the endpoint URL")
    secure = parsed.scheme == "https"
    port = parsed.port or (443 if secure else 80)
    path = parsed.path or "/"
    return parsed.scheme, parsed.hostname, port, path, secure


def new_connection(host: str, port: int, secure: bool, timeout: float):
    if secure:
        return http.client.HTTPSConnection(
            host, port, timeout=timeout, context=ssl.create_default_context()
        )
    return http.client.HTTPConnection(host, port, timeout=timeout)


def request_once(
    connection,
    path: str,
    headers: dict[str, str],
    body: bytes,
) -> tuple[int, float]:
    started = time.perf_counter()
    try:
        connection.request("POST", path, body=body, headers=headers)
        response = connection.getresponse()
        response.read()
        elapsed_ms = (time.perf_counter() - started) * 1000
        return response.status, elapsed_ms
    except (OSError, http.client.HTTPException, TimeoutError, ssl.SSLError):
        connection.close()
        raise


def worker(
    index: int,
    args: argparse.Namespace,
    state: RunState,
    ready: threading.Barrier,
    release: threading.Event,
    results: list[WorkerResult],
    headers: dict[str, str],
    body: bytes,
    endpoint: tuple[str, str, int, str, bool],
    rate_queue: queue.Queue[float | None] | None,
) -> None:
    scheme, host, port, path, secure = endpoint
    del scheme
    result = WorkerResult()
    results[index] = result
    connection = new_connection(host, port, secure, args.timeout)

    for _ in range(args.warmup_per_worker):
        try:
            request_once(connection, path, headers, body)
        except (OSError, http.client.HTTPException, TimeoutError, ssl.SSLError):
            connection = new_connection(host, port, secure, args.timeout)

    try:
        ready.wait()
        release.wait()
        if state.mode == "concurrency":
            stop_at = state.started_at + state.duration
            while time.perf_counter() < stop_at:
                result.started += 1
                try:
                    status, elapsed_ms = request_once(connection, path, headers, body)
                    result.status_counts[str(status)] += 1
                    result.latencies_ms.append(elapsed_ms)
                except (OSError, http.client.HTTPException, TimeoutError, ssl.SSLError) as error:
                    result.errors[type(error).__name__] += 1
                    connection = new_connection(host, port, secure, args.timeout)
        else:
            assert rate_queue is not None
            while True:
                due = rate_queue.get()
                if due is None:
                    break
                lag_ms = max(0.0, (time.perf_counter() - due) * 1000)
                if lag_ms > args.max_start_lag_ms:
                    result.late_drops += 1
                    continue
                result.start_lag_ms.append(lag_ms)
                result.started += 1
                try:
                    status, elapsed_ms = request_once(connection, path, headers, body)
                    result.status_counts[str(status)] += 1
                    result.latencies_ms.append(elapsed_ms)
                except (OSError, http.client.HTTPException, TimeoutError, ssl.SSLError) as error:
                    result.errors[type(error).__name__] += 1
                    connection = new_connection(host, port, secure, args.timeout)
    finally:
        connection.close()


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return round(ordered[max(0, math.ceil(fraction * len(ordered)) - 1)], 3)


def summarize(
    results: list[WorkerResult],
    args: argparse.Namespace,
    state: RunState,
    elapsed: float,
) -> dict:
    latencies = [value for result in results for value in result.latencies_ms]
    lags = [value for result in results for value in result.start_lag_ms]
    statuses: collections.Counter[str] = collections.Counter()
    errors: collections.Counter[str] = collections.Counter()
    for result in results:
        statuses.update(result.status_counts)
        errors.update(result.errors)

    succeeded = sum(count for status, count in statuses.items() if status.startswith("2"))
    responses = sum(statuses.values())
    attempted = sum(result.started for result in results)
    transport_errors = sum(errors.values())
    late_drops = state.late_drops + sum(result.late_drops for result in results)
    scheduled = (
        math.ceil(args.rate * args.duration)
        if args.mode == "rate"
        else None
    )
    return {
        "mode": args.mode,
        "measurement_window_seconds": args.duration,
        "drain_seconds": round(max(0.0, elapsed - args.duration), 3),
        "workers": args.workers,
        "target_rate_per_second": args.rate if args.mode == "rate" else None,
        "max_start_lag_ms": args.max_start_lag_ms if args.mode == "rate" else None,
        "requests": {
            "scheduled": scheduled,
            "started": attempted,
            "http_responses": responses,
            "succeeded": succeeded,
            "late_dropped": late_drops,
            "status_counts": dict(sorted(statuses.items())),
            "transport_errors": dict(sorted(errors.items())),
            "success_rate": round(succeeded / attempted, 6) if attempted else None,
            "scheduled_success_rate": (
                round(succeeded / scheduled, 6) if scheduled else None
            ),
            "started_per_second": round(attempted / args.duration, 3),
            "successful_per_second": round(succeeded / args.duration, 3),
            "transport_error_count": transport_errors,
        },
        "latency_ms": {
            "p50": percentile(latencies, 0.50),
            "p90": percentile(latencies, 0.90),
            "p95": percentile(latencies, 0.95),
            "p99": percentile(latencies, 0.99),
            "max": round(max(latencies), 3) if latencies else None,
            "mean": round(sum(latencies) / len(latencies), 3) if latencies else None,
        },
        "scheduled_start_lag_ms": {
            "p95": percentile(lags, 0.95) if lags else None,
            "p99": percentile(lags, 0.99) if lags else None,
            "max": round(max(lags), 3) if lags else None,
        },
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Load-test one OpenAI-compatible chat-completions endpoint."
    )
    parser.add_argument("endpoint", help="full chat-completions URL")
    parser.add_argument("--model", required=True, help="public model alias sent in the request")
    parser.add_argument("--mode", choices=("concurrency", "rate"), default="concurrency")
    parser.add_argument("--workers", type=int, default=64, help="persistent client connections")
    parser.add_argument("--rate", type=float, help="scheduled requests/second in rate mode")
    parser.add_argument("--duration", type=float, default=30.0, help="measurement window in seconds")
    parser.add_argument("--warmup-per-worker", type=int, default=10)
    parser.add_argument("--max-start-lag-ms", type=float, default=250.0)
    parser.add_argument("--timeout", type=float, default=30.0, help="per-request timeout in seconds")
    parser.add_argument("--prompt", default="Return the word OK.")
    parser.add_argument("--bearer-env", help="environment variable containing a gateway key")
    parser.add_argument("--out", help="write the JSON report to this file instead of stdout")
    args = parser.parse_args()
    if args.workers < 1 or args.duration <= 0 or args.timeout <= 0:
        parser.error("workers, duration, and timeout must be positive")
    if args.warmup_per_worker < 0 or args.max_start_lag_ms < 0:
        parser.error("warmup and maximum start lag cannot be negative")
    if args.mode == "rate" and (args.rate is None or args.rate <= 0):
        parser.error("rate mode requires a positive --rate")
    if args.mode == "concurrency" and args.rate is not None:
        parser.error("--rate is only valid in rate mode")
    return args


def main() -> int:
    args = parse_args()
    try:
        endpoint = endpoint_parts(args.endpoint)
    except ValueError as error:
        print(f"gateway-benchmark: {error}", file=sys.stderr)
        return 2

    token = None
    if args.bearer_env:
        token = os.environ.get(args.bearer_env)
        if not token:
            print(
                f"gateway-benchmark: environment variable {args.bearer_env} is not set",
                file=sys.stderr,
            )
            return 2

    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(
        {
            "model": args.model,
            "messages": [{"role": "user", "content": args.prompt}],
            "max_tokens": 8,
        },
        separators=(",", ":"),
    ).encode()

    state = RunState(args.mode, args.duration, args.rate)
    ready = threading.Barrier(args.workers + 1)
    release = threading.Event()
    rate_queue: queue.Queue[float | None] | None = (
        queue.Queue(maxsize=args.workers) if args.mode == "rate" else None
    )
    results = [WorkerResult() for _ in range(args.workers)]
    started_at = None
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [
            executor.submit(
                worker,
                index,
                args,
                state,
                ready,
                release,
                results,
                headers,
                body,
                endpoint,
                rate_queue,
            )
            for index in range(args.workers)
        ]
        ready.wait()
        started_at = dt.datetime.now(dt.timezone.utc).isoformat()
        state.started_at = time.perf_counter()
        release.set()
        if rate_queue is not None:
            assert args.rate is not None
            scheduled = math.ceil(args.rate * args.duration)
            for ticket in range(scheduled):
                due = state.started_at + ticket / args.rate
                delay = due - time.perf_counter()
                if delay > 0:
                    time.sleep(delay)
                if time.perf_counter() - due > args.max_start_lag_ms / 1000:
                    state.late_drops += 1
                    continue
                try:
                    rate_queue.put_nowait(due)
                except queue.Full:
                    state.late_drops += 1
            for _ in range(args.workers):
                rate_queue.put(None)
        for future in futures:
            future.result()
    elapsed = time.perf_counter() - state.started_at

    scheme, host, port, path, _ = endpoint
    default_port = 443 if scheme == "https" else 80
    display_host = f"[{host}]" if ":" in host else host
    target = f"{scheme}://{display_host}{':' + str(port) if port != default_port else ''}{path}"
    report = {
        "schema_version": 1,
        "started_at_utc": started_at,
        "target": target,
        "model": args.model,
        "payload_bytes": len(body),
        "client": {
            "python": platform.python_version(),
            "platform": platform.platform(),
            "logical_cpu_count": os.cpu_count(),
            "connection_policy": "one persistent HTTP connection per worker",
            "warmup_requests_per_worker": args.warmup_per_worker,
        },
        "result": summarize(results, args, state, elapsed),
    }
    rendered = json.dumps(report, indent=2, sort_keys=True)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as output:
            output.write(rendered + "\n")
    else:
        print(rendered)

    result = report["result"]
    if result["requests"]["started"] == 0:
        return 1
    if result["requests"]["succeeded"] != result["requests"]["started"]:
        return 1
    if result["requests"]["late_dropped"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
