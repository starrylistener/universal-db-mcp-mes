# Batch ID Generation for insert_exception_data

**Goal:** Optimize `insert_exception_data` to allocate IDs in bulk and perform batch INSERTs, reducing database round-trips.

**Current behavior:**
- `generateMessageId()` is called once per row
- Each call queries seq table, updates seq table, returns one ID
- Main table and tl table are inserted row by row

**New behavior:**
- Add `generateMessageIds(count: number)` that allocates `count` consecutive IDs in a single seq table interaction
- `insertExceptionData` collects all IDs upfront, then performs batch INSERTs for both main and tl tables

**Key constraints:**
- Transaction protection remains (already implemented)
- `FOR UPDATE` lock on seq row ensures serial allocation under concurrency
- `seqValue` and `maxBase` are still base values (without suffix); generated IDs are `parseInt(`${base + i}${suffix}`, 10)`
- `seq` table stores the last allocated base; minor drift is acceptable

**Files to change:**
- `src/core/database-service.ts`: add `generateMessageIds`, modify `insertExceptionData`
