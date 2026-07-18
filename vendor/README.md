# vendor/firebase-bundle.js

Self-hosted, bundled Firebase Web SDK (app + firestore + auth), served from our
own domain instead of `https://www.gstatic.com/firebasejs/...`.

**Why:** loading the SDK from gstatic put an external CDN on the critical path.
On mobile networks that couldn't reliably reach gstatic, the ES modules failed
to finish loading and sign-in showed "Firebase did not finish loading" timeouts.
Serving the SDK from the app's own origin makes it load as reliably as the page.

## Rebuild / upgrade

```sh
mkdir fbbuild && cd fbbuild
npm init -y
npm install firebase@12 esbuild

cat > entry.js <<'EOF'
export { initializeApp } from 'firebase/app';
export { getFirestore, collection, addDoc, query, where, getDocs, limit, orderBy, onSnapshot, deleteDoc, doc, updateDoc } from 'firebase/firestore';
export { getAuth, GoogleAuthProvider, signInWithRedirect, signInWithPopup, getRedirectResult, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile, onAuthStateChanged } from 'firebase/auth';
EOF

./node_modules/.bin/esbuild entry.js --bundle --format=esm \
  --outfile=firebase-bundle.js --minify --legal-comments=none
```

Then copy `firebase-bundle.js` here. If you add a new Firebase call in
`index.html`, add its export to `entry.js` and rebuild.
