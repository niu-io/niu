#!/usr/bin/env python3
"""Bounded, read-only activity API load; metrics are not accounting acceptance."""
import argparse
import collections
import concurrent.futures
import datetime
import ipaddress
import json
import math
import os
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("endpoint", help="Complete workspace /requests URL, without query")
    parser.add_argument("--bearer-env", default="NIU_REPORTING_TOKEN")
    parser.add_argument("--requests", type=int, default=100)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--timeout", type=float, default=15)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    url = urllib.parse.urlsplit(args.endpoint)
    try:
        loopback = ipaddress.ip_address(url.hostname or "").is_loopback
    except ValueError:
        loopback = url.hostname == "localhost"
    if (url.scheme not in ("http", "https") or not url.hostname
            or url.username is not None or url.password is not None
            or url.query or url.fragment or (url.scheme == "http" and not loopback)):
        parser.error("Use HTTPS, or loopback HTTP, without credentials, query or fragment")
    identifier = r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}"
    if not re.fullmatch(rf"/admin/v1/organizations/{identifier}/projects/{identifier}/requests", url.path):
        parser.error("Endpoint must be a workspace activity-list route")
    if not (1 <= args.requests <= 10000 and 1 <= args.workers <= 32
            and 1 <= args.limit <= 100 and 0 < args.timeout <= 60):
        parser.error("Bounds: requests 1–10000, workers 1–32, limit 1–100, timeout (0,60]")
    token = os.environ.get(args.bearer_env)
    if not token or "\r" in token or "\n" in token:
        parser.error("Bearer environment variable is absent or invalid")
    # Refuse replacement before sending traffic. Reports contain no endpoint,
    # identifiers, response bodies, customer amounts or authorization material.
    try:
        output = args.out.open("x", encoding="utf-8")
    except OSError:
        parser.error("Output must be a new writable file")
    os.chmod(args.out, 0o600)

    def read(_):
        started = time.perf_counter()
        status, failure = None, None
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        request = urllib.request.Request(
            args.endpoint + "?limit=" + str(args.limit),
            headers={"Authorization": "Bearer " + token, "Accept": "application/json"},
        )
        try:
            with opener.open(request, timeout=args.timeout) as response:
                status = response.status
                raw = response.read(8 * 1024 * 1024 + 1)
                if len(raw) > 8 * 1024 * 1024:
                    failure = "response_too_large"
                elif status != 200:
                    failure = "http_status"
                else:
                    value = json.loads(raw)
                    rows = value.get("data")
                    summary = value.get("summary")
                    if (not isinstance(rows, list) or len(rows) > args.limit
                            or not isinstance(summary, dict)
                            or type(summary.get("request_count")) is not int
                            or summary["request_count"] < len(rows)
                            or "no-store" not in response.headers.get("Cache-Control", "")):
                        failure = "response_contract"
        except urllib.error.HTTPError as error:
            status, failure = error.code, "http_status"
            error.close()
        except (ValueError, TypeError, AttributeError):
            failure = "response_contract"
        except Exception:
            # Transport exception text can contain private URLs. Do not retain it.
            failure = "transport"
        return {"status": status, "failure": failure,
                "elapsed_ms": (time.perf_counter() - started) * 1000}

    started = time.perf_counter()
    with output:
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
            results = list(executor.map(read, range(args.requests)))
        elapsed = time.perf_counter() - started
        latencies = sorted(row["elapsed_ms"] for row in results)
        report = {
            "recorded_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "requests": args.requests, "workers": args.workers, "page_limit": args.limit,
            "elapsed_seconds": elapsed, "requests_per_second": args.requests / elapsed,
            "p50_ms": latencies[math.ceil(len(latencies) * .5) - 1],
            "p95_ms": latencies[math.ceil(len(latencies) * .95) - 1],
            "maximum_ms": latencies[-1],
            "statuses": dict(collections.Counter(str(row["status"]) for row in results)),
            "failures": dict(collections.Counter(row["failure"] for row in results if row["failure"])),
            "samples": results,
            "scope": "HTTP reads only; independently verify actual data and accounting",
        }
        json.dump(report, output, indent=2)
        output.write("\n")
    print(json.dumps({k: report[k] for k in ("requests", "workers", "statuses", "failures", "p95_ms")}))
    return 1 if report["failures"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
