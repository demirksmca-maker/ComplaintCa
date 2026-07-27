# Firestore rules tests

Exercises `../../firestore.rules` (symlinked in as `firestore.rules`) against
a local Firestore emulator — nothing here touches the live Firebase project.

```sh
cd test/firestore-rules
npm install
npm test
```

`npm test` runs `firebase emulators:exec`, which starts a local Firestore
emulator (downloading it on first run), runs `rules.test.mjs` against it,
then shuts it down.
