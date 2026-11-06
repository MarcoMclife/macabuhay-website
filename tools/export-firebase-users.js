// STEP 1 of the member move. Run this in the browser, not in a terminal.
//
// 1. Sign in to the CURRENT site as admin and open https://www.themacabuhay.com/admin.html
// 2. Open DevTools (Cmd+Option+J on Mac), paste everything below into the Console, press Enter.
// 3. The member list is copied to your clipboard as JSON. Paste it into a file
//    called firebase-users.json next to import-members.mjs.
//
// It only READS the Firestore "users" collection; nothing is changed.

(async () => {
  const v = '10.12.0';
  const { getApp } = await import(`https://www.gstatic.com/firebasejs/${v}/firebase-app.js`);
  const { getFirestore, collection, getDocs } = await import(`https://www.gstatic.com/firebasejs/${v}/firebase-firestore.js`);
  const snap = await getDocs(collection(getFirestore(getApp()), 'users'));
  const rows = snap.docs.map((d) => {
    const u = d.data();
    return {
      email: u.email || '',
      name: u.displayName || '',
      role: u.role || 'pending',
      createdAt: u.createdAt && u.createdAt.toDate ? u.createdAt.toDate().toISOString() : null,
    };
  }).filter((u) => u.email);
  copy(JSON.stringify(rows, null, 2));
  console.log(`Copied ${rows.length} members to the clipboard.`);
})();
