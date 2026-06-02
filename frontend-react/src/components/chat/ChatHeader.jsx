export default function ChatHeader({ isConnected, room, onBack }) {
  return (
    <header className="chat-header">
      <div className="chat-header-main">
        <button type="button" className="chat-back-button" aria-label="返回聊天列表" onClick={onBack}>
          ‹
        </button>
        <div>
          <p className="eyebrow">Direct Message</p>
          <h1>{room.name}</h1>
        </div>
      </div>
      <span className={`status ${isConnected ? 'status-connected' : ''}`}>
        {isConnected ? '已連線' : '未連線'}
      </span>
    </header>
  )
}
