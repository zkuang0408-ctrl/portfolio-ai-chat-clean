# Chat Page Index Clearance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the desktop homepage AI conversation area upward so its answer, composer, and status never overlap the lower-left page index.

**Architecture:** Keep the existing absolute desktop composition and mobile normal-flow override. Increase the desktop `.hero-chat` bottom inset and reduce its matching maximum height so long content remains inside the existing scroll region.

**Tech Stack:** CSS, TypeScript, Vitest, Vite, Vercel

---

### Task 1: Lock the desktop clearance in a regression test

**Files:**
- Modify: `src/styles.test.ts:189-203`
- Test: `src/styles.test.ts`

- [ ] **Step 1: Write the failing test**

Replace the old desktop-position expectations with:

```ts
test("keeps the frameless desktop assistant clear of the page index", () => {
  const heroChat = rule(".hero-chat");

  expect(heroChat).toMatch(/position:\s*absolute/);
  expect(heroChat).toMatch(/z-index:\s*3/);
  expect(heroChat).toMatch(/top:\s*39%/);
  expect(heroChat).toMatch(/bottom:\s*clamp\(96px,\s*10vh,\s*112px\)/);
  expect(heroChat).toMatch(/left:\s*6\.5%/);
  expect(heroChat).toMatch(/width:\s*min\(330px,\s*24vw\)/);
  expect(heroChat).toMatch(
    /max-height:\s*calc\(61%\s*-\s*clamp\(96px,\s*10vh,\s*112px\)\)/,
  );
  expect(heroChat).toMatch(/border:\s*0/);
  expect(heroChat).toMatch(/border-radius:\s*0/);
  expect(heroChat).toMatch(/background:\s*transparent/);
  expect(heroChat).toMatch(/box-shadow:\s*none/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
& 'D:\APPS\claude\npm.cmd' test -- --run src/styles.test.ts
```

Expected: FAIL because `.hero-chat` still uses `bottom: clamp(24px, 3vh, 34px)` and `max-height: calc(61% - 24px)`.

### Task 2: Raise the desktop chat boundary

**Files:**
- Modify: `src/styles.css:168-181`
- Test: `src/styles.test.ts`

- [ ] **Step 1: Implement the minimal CSS change**

Change only the two desktop geometry declarations:

```css
.hero-chat {
  position: absolute;
  z-index: 3;
  top: 39%;
  bottom: clamp(96px, 10vh, 112px);
  left: 6.5%;
  width: min(330px, 24vw);
  max-height: calc(61% - clamp(96px, 10vh, 112px));
  margin: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
```

- [ ] **Step 2: Run the focused test and verify GREEN**

Run:

```powershell
& 'D:\APPS\claude\npm.cmd' test -- --run src/styles.test.ts
```

Expected: `src/styles.test.ts` passes, including the existing mobile assertions for `bottom: auto` and `max-height: none`.

- [ ] **Step 3: Run full verification**

Run:

```powershell
& 'D:\APPS\claude\npm.cmd' test
& 'D:\APPS\claude\npm.cmd' run build
```

Expected: all Vitest tests pass; knowledge index verification reports 8 sources and 139 chunks; Vite production build succeeds.

- [ ] **Step 4: Commit the implementation**

```powershell
git add src/styles.css src/styles.test.ts
git commit -m "fix: keep homepage chat clear of page index"
```

### Task 3: Deploy and inspect a new Preview

**Files:**
- No source changes

- [ ] **Step 1: Deploy a Preview**

Run the linked Vercel CLI without `--prod`:

```powershell
& 'C:\Users\Kuang\AppData\Local\npm-cache\_npx\69f9afb961c37556\node_modules\.bin\vercel.cmd' --yes --no-color
```

Expected: deployment reaches `READY` and returns a unique `vercel.app` Preview URL.

- [ ] **Step 2: Browser acceptance check**

Open the Preview at desktop width and confirm:

- the chat answer, composer, and status remain above the lower-left page index;
- the left alignment and transparent visual treatment are unchanged;
- a long answer scrolls inside the chat region;
- mobile layout remains in normal flow.
