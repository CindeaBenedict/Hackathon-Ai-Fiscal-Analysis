type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

type DataChatPageProps = {
  messages: ChatMessage[];
  model: string;
  onModelChange: (value: string) => void;
  onSend: (message: string) => Promise<void>;
};

function DataChatPage({ messages, model, onModelChange, onSend }: DataChatPageProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Data AI Chat</h2>
          <p className="muted">Ask the AI advisor questions based on uploaded data.</p>
        </div>
      </div>

      <div className="controls-grid">
        <label>
          Model
          <input value={model} onChange={(event) => onModelChange(event.target.value)} />
        </label>
      </div>

      <form
        className="actions-row"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const message = String(formData.get("message") || "").trim();
          if (!message) return;
          void onSend(message);
          event.currentTarget.reset();
        }}
      >
        <input name="message" placeholder="Ask about your uploaded data..." />
        <button className="primary-button" type="submit">
          Send
        </button>
      </form>

      <div className="chat-list">
        {messages.map((msg) => (
          <article key={msg.id} className={`chat-bubble ${msg.role}`}>
            <header>
              <strong>{msg.role === "user" ? "You" : "AI Advisor"}</strong>
              <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
            </header>
            <p>{msg.content}</p>
          </article>
        ))}
        {messages.length === 0 ? (
          <p className="muted">No messages yet. Upload data and start asking.</p>
        ) : null}
      </div>
    </section>
  );
}

export type { ChatMessage };
export default DataChatPage;
