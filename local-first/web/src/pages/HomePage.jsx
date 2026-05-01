export default function HomePage() {
  return (
    <div>
      <h1>KOT — local-first</h1>
      <p>
        This UI talks to the Fastify server under <code>local-first/server</code> (HTTP + Socket.IO
        only). The legacy Supabase app at the repo root is unchanged.
      </p>
      <ul>
        <li>
          <a href="/local-health">System status</a> — Postgres, MQTT, Socket.IO
        </li>
        <li>
          <a href="/devices">Devices</a> — list + test MQTT via outbox
        </li>
      </ul>
    </div>
  );
}
