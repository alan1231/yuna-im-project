## 開發模式

啟動可自動重啟的 Python agent：

```bash
python3 dev_agent.py
```

之後修改目前資料夾內的 `.py` 檔時，`dev_agent.py` 會自動停止舊的 `agent.py` 並重新執行。
如果 `agent.py` 因為 MongoDB、套件或查詢錯誤而自己停止，`dev_agent.py` 也會在短暫等待後自動重啟。
