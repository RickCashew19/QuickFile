const app = require('./app');

async function testViews() {
  console.log('Testing EJS templates and HTTP routing...');
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  const publicRoutes = [
    '/',
    '/verify',
    '/citizen/login',
    '/citizen/register',
    '/citizen/forgot-password',
    '/staff/login',
    '/admin/login'
  ];

  for (const route of publicRoutes) {
    const res = await fetch(`${baseUrl}${route}`);
    console.log(`GET ${route} -> Status: ${res.status}`);
    if (res.status !== 200) {
      const text = await res.text();
      console.error(`Failed on ${route}:`, text.slice(0, 300));
      server.close();
      process.exit(1);
    }
  }

  // Test Citizen Authenticated Views
  console.log('\nTesting Citizen Authenticated Views rendering...');
  const citizenLoginRes = await fetch(`${baseUrl}/citizen/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ email: 'citizen@quickfile.gov.ph', password: 'Citizen@123456' })
  });
  const citizenCookies = citizenLoginRes.headers.getSetCookie ? citizenLoginRes.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') : '';

  const citizenRoutes = [
    '/citizen/dashboard',
    '/citizen/catalog',
    '/citizen/history',
    '/citizen/notifications',
    '/citizen/profile'
  ];

  for (const route of citizenRoutes) {
    const res = await fetch(`${baseUrl}${route}`, {
      headers: { Cookie: citizenCookies },
      redirect: 'manual'
    });
    console.log(`GET ${route} -> Status: ${res.status}`);
    if (res.status !== 200) {
      const text = await res.text();
      console.error(`Failed on ${route}: status ${res.status}`, text.slice(0, 300));
      server.close();
      process.exit(1);
    }
  }

  // Test Staff Authenticated Views
  console.log('\nTesting Staff Authenticated Views rendering...');
  const staffLoginRes = await fetch(`${baseUrl}/staff/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ email: 'staff@quickfile.gov.ph', password: 'Staff@123456' })
  });
  const staffCookies = staffLoginRes.headers.getSetCookie ? staffLoginRes.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') : '';

  const staffRoutes = [
    '/staff/dashboard',
    '/staff/requests',
    '/staff/records',
    '/staff/verify',
    '/staff/reports'
  ];

  for (const route of staffRoutes) {
    const res = await fetch(`${baseUrl}${route}`, {
      headers: { Cookie: staffCookies },
      redirect: 'manual'
    });
    console.log(`GET ${route} -> Status: ${res.status}`);
    if (res.status !== 200) {
      const text = await res.text();
      console.error(`Failed on ${route}: status ${res.status}`, text.slice(0, 300));
      server.close();
      process.exit(1);
    }
  }

  // Test Admin Authenticated Views
  console.log('\nTesting Admin Authenticated Views rendering...');
  const adminLoginRes = await fetch(`${baseUrl}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ email: 'admin@quickfile.gov.ph', password: 'Admin@123456' })
  });
  const adminCookies = adminLoginRes.headers.getSetCookie ? adminLoginRes.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') : '';

  const adminRoutes = [
    '/admin/dashboard',
    '/admin/document-types',
    '/admin/staff-management',
    '/admin/reports',
    '/admin/records',
    '/admin/issued-documents',
    '/admin/audit-logs',
    '/admin/settings'
  ];

  for (const route of adminRoutes) {
    const res = await fetch(`${baseUrl}${route}`, {
      headers: { Cookie: adminCookies },
      redirect: 'manual'
    });
    console.log(`GET ${route} -> Status: ${res.status}`);
    if (res.status !== 200) {
      const text = await res.text();
      console.error(`Failed on ${route}: status ${res.status}`, text.slice(0, 300));
      server.close();
      process.exit(1);
    }
  }

  console.log('\n✓ ALL ROUTES AND EJS VIEWS COMPILED AND RENDERED SUCCESSFULLY (200 OK)!');
  server.close();
  process.exit(0);
}

testViews().catch(err => {
  console.error('Routing test failure:', err);
  process.exit(1);
});
