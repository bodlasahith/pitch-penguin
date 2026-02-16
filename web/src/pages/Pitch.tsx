export default function Pitch() {
  return (
    <>
      <section className="page-header">
        <div>
          <div className="eyebrow">Pitch lab</div>
          <h1>Write your pitch</h1>
          <p>Build the idea, then pick a robot to read it out loud.</p>
        </div>
        <div className="panel">
          <h3>Time left</h3>
          <div className="timer">01:12</div>
          <p style={{ marginTop: '8px' }}>Voice: Neon Announcer</p>
        </div>
      </section>

      <section className="split">
        <div className="panel">
          <h3>Your pitch</h3>
          <textarea
            className="input textarea"
            placeholder="Sell the dream. Highlight the MUST HAVEs."
          />
          <div style={{ marginTop: '14px' }}>
            <strong>Select MUST HAVEs used (min 1)</strong>
            <ul className="list" style={{ marginTop: '10px' }}>
              <li>
                <label>
                  <input type="checkbox" /> Wearable component
                </label>
              </li>
              <li>
                <label>
                  <input type="checkbox" /> Solar power
                </label>
              </li>
              <li>
                <label>
                  <input type="checkbox" /> Public transit integration
                </label>
              </li>
              <li>
                <label>
                  <input type="checkbox" /> Daily ritual
                </label>
              </li>
            </ul>
          </div>
          <div className="footer-actions" style={{ marginTop: '16px' }}>
            <button className="button">Preview voice</button>
            <button className="button secondary">Save draft</button>
          </div>
        </div>
        <div className="panel">
          <h3>Robot voice</h3>
          <select className="input">
            <option>Neon Announcer</option>
            <option>Calm Founder</option>
            <option>Buzzword Bot</option>
            <option>Wall Street Hype</option>
          </select>
          <div className="card" style={{ marginTop: '16px' }}>
            <strong>Tip</strong>
            <span>Short punchy sentences sound best on the voice reader.</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <h3>Sketch pad</h3>
        <div className="canvas-placeholder">Drawing canvas goes here</div>
      </section>

      <section className="panel">
        <h3>Pitch assist (later)</h3>
        <p>
          If you run out of time, you can request a quick AI-generated pitch
          that follows the ASK + MUST HAVEs. Other players can challenge it
          during reveal; a confirmed AI pitch loses 1 point and is disqualified
          for the round.
        </p>
        <div className="footer-actions" style={{ marginTop: '16px' }}>
          <button className="button secondary">Generate quick pitch</button>
          <button className="button secondary">View challenge rules</button>
        </div>
      </section>
    </>
  )
}
