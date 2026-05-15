import signal
import subprocess
import sys
import time
from pathlib import Path


WATCH_DIR = Path(__file__).resolve().parent
WATCH_SUFFIXES = {".py"}
POLL_INTERVAL_SECONDS = 1
RESTART_DELAY_SECONDS = 2


def iter_watched_files():
    for path in WATCH_DIR.rglob("*"):
        if path.is_file() and path.suffix in WATCH_SUFFIXES:
            yield path


def snapshot_mtimes():
    return {
        path: path.stat().st_mtime
        for path in iter_watched_files()
        if "__pycache__" not in path.parts
    }


def start_agent():
    print("啟動 agent.py", flush=True)
    return subprocess.Popen([sys.executable, "agent.py"], cwd=WATCH_DIR)


def stop_agent(process):
    if process.poll() is not None:
        return

    print("停止舊的 agent.py", flush=True)
    process.send_signal(signal.SIGTERM)

    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()


def main():
    print("開發模式啟動：修改 .py 檔或 agent.py 自己停止後，會自動重啟 agent.py", flush=True)
    last_snapshot = snapshot_mtimes()
    process = start_agent()

    try:
        while True:
            time.sleep(POLL_INTERVAL_SECONDS)
            current_snapshot = snapshot_mtimes()

            if current_snapshot != last_snapshot:
                last_snapshot = current_snapshot
                stop_agent(process)
                process = start_agent()
            elif process.poll() is not None:
                print(f"agent.py 已停止，結束碼：{process.returncode}。{RESTART_DELAY_SECONDS} 秒後重啟。", flush=True)
                time.sleep(RESTART_DELAY_SECONDS)
                process = start_agent()
    except KeyboardInterrupt:
        print("\n結束開發模式", flush=True)
        stop_agent(process)


if __name__ == "__main__":
    main()
