"""Cleanup helpers for isolated native acceptance processes."""
import subprocess


def stop_process(process):
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def stop_postgres(directory):
    # pg_ctl can launch the server and fail its readiness wait. Probe only the
    # disposable runner-owned directory, regardless of the start command result.
    status = subprocess.run(
        ['pg_ctl', '-D', str(directory), 'status'],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    if status.returncode == 0:
        subprocess.run(
            ['pg_ctl', '-D', str(directory), '-m', 'fast', '-w', 'stop'],
            stdout=subprocess.DEVNULL, check=True,
        )
