I took a look through the codebase, and overall it's actually quite clean for a small-to-medium single-user application.

## What the project does well

### 1. Clear folder structure

The separation is intuitive:

```text
src/
├── components/
├── routes/
├── extensions/
├── db.ts
├── backup.ts
└── imageUtils.ts
```

A new developer can immediately understand where things live.

### 2. Strong TypeScript usage

The data model in `db.ts` is well documented:

```ts
export interface LorePage { ... }
export interface Infobox { ... }
export interface MapPin { ... }
```

The comments are useful and explain *why* things exist, not just *what* they are.

### 3. Sensible React architecture

The routes are separated cleanly:

* `HomeRoute`
* `PageRoute`
* `MapRoute`
* `TemplatesRoute`
* `CategoryRoute`

This keeps the navigation structure easy to understand.

### 4. Dexie is a good choice

Using Dexie + IndexedDB for an offline-first lore/wiki application is exactly the kind of problem Dexie solves well.

The code feels designed around:

> "Everything is local and persistent."

which matches the product's goals.

### 5. Readability

One thing I immediately noticed:

```ts
// Start in view mode whenever you open a different page.
useEffect(() => setEditing(false), [id])
```

There are comments like this everywhere.

Many hobby projects become unreadable after a few months; this one is likely still maintainable six months from now.

---

# Biggest architectural issue

## `db.ts` is becoming a God Object

The biggest smell in the project is:

```text
src/db.ts
578 lines
```

It contains:

* Types
* Constants
* Database schema
* Template logic
* Page logic
* Map logic
* Import/export logic
* Metadata logic
* Utility functions

That's too many responsibilities.

A future structure could look like:

```text
src/
├── db/
│   ├── database.ts
│   ├── pages.ts
│   ├── templates.ts
│   ├── maps.ts
│   ├── backup.ts
│   └── types.ts
```

This would be my #1 refactor priority.

---

# Second issue: business logic inside routes

For example `PageRoute.tsx` contains:

```ts
async function addTag()
async function removeTag()
async function changeCategory()
async function handleDelete()
async function followWikiLink()
```

This isn't bad today.

The problem is that as features grow, routes become giant "controller" files.

A cleaner approach would be:

```text
hooks/
├── usePage.ts
├── useTags.ts
├── useTemplates.ts
```

or

```text
services/
├── pageService.ts
├── templateService.ts
```

Then `PageRoute` mostly renders UI.

---

# Third issue: direct database access everywhere

I see many components/routes doing:

```ts
updatePage(...)
deletePage(...)
db.pages.get(...)
```

directly.

This works fine now, but it couples UI to storage.

A future abstraction:

```ts
pageRepository.update(...)
pageRepository.delete(...)
```

would make it easier later if you ever:

* switch to Electron
* add cloud sync
* add multiplayer
* move away from IndexedDB

Right now Dexie leaks into much of the application.

---

# What I would NOT change

Many developers would suggest:

* Redux
* Zustand
* React Query
* CQRS
* Domain Driven Design
* Dependency Injection

I would **not** add any of that.

The project is currently small enough that those additions would make it worse.

The architecture is currently:

> React + Dexie + a few helper functions

which is refreshingly simple.

---

# Code quality score

If I were reviewing this as a GitHub project:

| Area                   | Score  |
| ---------------------- | ------ |
| Readability            | 9/10   |
| Folder structure       | 8/10   |
| Type safety            | 8.5/10 |
| Maintainability        | 8/10   |
| Separation of concerns | 7/10   |
| Scalability            | 6.5/10 |

**Overall: 8/10**

For a solo worldbuilding tool, it's better organized than most hobby React projects I see. The main thing I'd watch is preventing `db.ts` and route files from continuously accumulating responsibilities as new features are added. If those are kept under control, the codebase should remain pleasant to work in for quite a while.
