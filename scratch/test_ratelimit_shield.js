async function testRateLimitShield() {
  console.log('Sending rapid requests to test backoff & caching...');
  const t1 = Date.now();
  const res1 = await fetch('http://localhost:3000/api/ozon/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store: 'store1', date_from: '2026-08-17', date_to: '2026-08-24' })
  });
  console.log(`Req 1 status: ${res1.status} (${Date.now() - t1}ms)`);

  const t2 = Date.now();
  const res2 = await fetch('http://localhost:3000/api/ozon/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store: 'store1', date_from: '2026-08-17', date_to: '2026-08-24' })
  });
  console.log(`Req 2 status (Cached): ${res2.status} (${Date.now() - t2}ms)`);

  const data = await res2.json();
  console.log('Success:', data.success);
  console.log('Summary:', data.summary);
}

testRateLimitShield().catch(console.error);
