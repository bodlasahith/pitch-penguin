export default function Deal() {
  return (
    <>
      <section className="page-header">
        <div>
          <div className="eyebrow">Round 2</div>
          <h1>Deal the cards</h1>
          <p>
            The Walrus reads the ASK (or a narrator voice does). Keep your
            MUST HAVEs close.
          </p>
        </div>
        <div className="pill">Walrus Surprise: Secret draw</div>
      </section>

      <section className="split">
        <div className="panel">
          <h3>ASK</h3>
          <div className="card">
            <strong>Urban commuters are exhausted.</strong>
            <span>Pitch a product that makes their mornings easier.</span>
          </div>
        </div>
        <div className="panel">
          <h3>Your MUST HAVEs</h3>
          <p style={{ marginTop: '6px', color: '#6b6056' }}>
            Use at least 1 in your pitch.
          </p>
          <div className="card-stack">
            <div className="card">
              <strong>Must include a wearable component.</strong>
              <span>Something you put on every day.</span>
            </div>
            <div className="card">
              <strong>Must run on solar power.</strong>
              <span>Keep it clean, keep it light.</span>
            </div>
            <div className="card">
              <strong>Must integrate with public transit.</strong>
              <span>Think kiosks, NFC, or live data.</span>
            </div>
            <div className="card">
              <strong>Must include a daily ritual.</strong>
              <span>Something repeatable and memorable.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <h3>Walrus Surprise (private)</h3>
        <div className="card">
          <strong>Only the assigned player sees this card.</strong>
          <span>One random non-Walrus player must include it in their pitch.</span>
        </div>
      </section>
    </>
  )
}
