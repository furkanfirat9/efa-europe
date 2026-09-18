async function testLocalRoute() {
  const res = await fetch('http://localhost:3000/api/ozon/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store: 'store1' })
  });

  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Success:', data.success);
  console.log('Summary:', data.summary);
  console.log('Days count:', data.days?.length);
  console.log('Top products count:', data.topProducts?.length);
  if (data.topProducts?.length > 0) {
    console.log('Top product sample:', data.topProducts[0]);
  }
}

testLocalRoute().catch(console.error);
