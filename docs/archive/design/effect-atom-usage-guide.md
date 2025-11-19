# Effect Atom Usage Guide

Comprehensive guide to using Effect Atom in the KXP frontend, based on official tutorials and our implementation patterns.

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Derived Atoms](#derived-atoms)
3. [Effectful Atoms](#effectful-atoms)
4. [Function Atoms](#function-atoms)
5. [Reading Result Atoms](#reading-result-atoms)
6. [Optimistic Updates](#optimistic-updates)
7. [Real-World Patterns](#real-world-patterns)
8. [Runtime Configuration](#runtime-configuration)

---

## Core Concepts

Effect Atom is a state management library that combines Effect-TS with atomic state. Key concepts:

- **Atoms**: Containers for state that can be read, written, and derived
- **Results**: Atoms that return `Result<Success, Failure>` for async operations
- **Runtimes**: Configured Effect environments for executing atoms
- **Reactivity**: Atoms automatically track dependencies and recompute when dependencies change

### Basic Atom Types

```typescript
// Writable atom - can read and write
Atom.Writable<Read, Write>

// Read-only atom - derived from other atoms
Atom.Atom<Value>

// Result atom - wraps Effect operations
Atom.Atom<Result<Success, Failure>>

// Function atom - creates new state from inputs
Atom.AtomResultFn<Input, Success, Failure>
```

---

## Derived Atoms

**Tutorial 1: Derived Atom I**
*Use the getter to derive read-only values that stay in sync with source atoms*

### Pattern: Simple Derived Value

Derived atoms compute values from other atoms and automatically update when dependencies change.

```typescript
// Source atom
const countAtom = Atom.make(0)

// Derived atom - ALWAYS stays in sync with countAtom
const doubleCountAtom = Atom.make((get) => get(countAtom) * 2)
```

**Key Points:**
- Derived atoms are **read-only** (you cannot write to them directly)
- They **automatically recompute** when any source atom changes
- The `get` function tracks dependencies

### Example from Our Codebase

```typescript
// Derived from writable timelineAtom
export const currentPlaysAtom = Atom.map(timelineAtom, (state) => state.plays)
```

**Tutorial 2: Derived Atom II**
*Derived atoms can watch multiple source atoms and recompute when any change*

### Pattern: Multi-Source Derivation

```typescript
const textAtom = Atom.make("Hello")
const countAtom = Atom.make(3)

// Derives from BOTH atoms
const repeatedAtom = Atom.make((get) => {
  const text = get(textAtom)
  const count = get(countAtom)
  return Array(count).fill(text).join(" ")
})
```

**Key Points:**
- Call `get()` for each atom you want to track
- Atom recomputes when **any** dependency changes
- Order of `get()` calls doesn't matter

---

## Effectful Atoms

**Tutorial 3: Effectful Atom**
*Effect atom that runs async logic—reruns automatically when dependencies change*

### Pattern: Async Atom with Effect

Effectful atoms wrap Effects and return `Result<Success, Failure>`.

```typescript
// Returns Result<number, never>
const diceRollAtom = Atom.make((get) =>
  Effect.gen(function* () {
    const count = get(countAtom)  // Tracks dependency
    yield* Effect.sleep("100 millis")
    return yield* Random.nextIntBetween(1, 7)
  })
)
```

**Key Points:**
- Returns `Result<A, E>` not plain `A`
- Automatically **reruns** when tracked atoms change
- Use `get.result()` to read other Result atoms (see below)
- Components see loading/error/success states

**Tutorial 4: Effectful Atom II**
*Fetch real-world data from API—effect atom reruns when dependencies change*

### Pattern: HTTP Request Atom

```typescript
const cityAtom = Atom.make("tokyo")

const weatherAtom = Atom.make((get) =>
  Effect.gen(function* () {
    const city = get(cityAtom)  // Reruns when city changes

    const client = yield* HttpClient.HttpClient
    const response = yield* client.get(`/weather/${city}`)
    const data = yield* HttpClientResponse.schemaBodyJson(WeatherSchema)(response)

    return data
  })
)
```

**Real-world example from our codebase:**

```typescript
// Fetches timeline data as Effect
const fetchTimelineEffect = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient

  const request = HttpClientRequest.get("/api/plays/timeline").pipe(
    HttpClientRequest.setUrlParams({ limit: "50" })
  )

  const response = yield* client.execute(request).pipe(
    Effect.mapError((cause): NetworkError => new NetworkError({
      cause,
      url: "/api/plays/timeline"
    }))
  )

  const data = yield* HttpClientResponse.schemaBodyJson(TimelineResponse)(response).pipe(
    Effect.mapError((cause): TimelineApiError => new TimelineApiError({
      cause,
      context: "Failed to parse timeline response"
    }))
  )

  return new TimelineState({
    plays: data.results,
    cursor: data.next_cursor,
    hasMore: data.has_more,
    isLoading: false,
    error: null
  })
})
```

---

## Function Atoms

**Tutorial 5: Atom.fn**
*Trigger an effect via useAtomSet—takes input, returns Result*

### Pattern: Mutation Function

Function atoms are like "actions" - they take input and produce new state through Effects.

```typescript
// Function atom - takes void input, returns Result<number[], never>
const rollDiceAtom = Atom.fn<void>()(
  (_, get) => Effect.gen(function* () {
    const count = get(countAtom)  // Can read other atoms

    // Generate random dice rolls
    const rolls = yield* Effect.all(
      Array.from({ length: count }, () => Random.nextIntBetween(1, 7))
    )

    return rolls
  })
)
```

**Usage in components:**

```typescript
function Component() {
  const rollDice = useAtomSet(rollDiceAtom)

  return (
    <button onClick={() => rollDice()}>
      Roll Dice
    </button>
  )
}
```

### Pattern: Runtime Function

Use `runtime.fn()` for functions that need services from a specific runtime.

```typescript
// Function that uses HttpClient from httpRuntime
export const appendPlaysAtom = httpRuntime.fn<string>()(
  (cursor, get) => Effect.gen(function* () {
    // Read current state
    const currentState = get(persistedTimelineAtom)

    // Perform HTTP operation using runtime's HttpClient
    const client = yield* HttpClient.HttpClient
    const request = HttpClientRequest.get("/api/plays/timeline").pipe(
      HttpClientRequest.setUrlParams({ cursor, limit: "50" })
    )

    const response = yield* client.execute(request)
    const data = yield* HttpClientResponse.schemaBodyJson(TimelineResponse)(response)

    // Return new state
    return new TimelineState({
      ...currentState,
      plays: [...currentState.plays, ...data.results],
      cursor: data.next_cursor,
      hasMore: data.has_more,
      isLoading: false,
      error: null
    })
  })
)
```

**Usage:**

```typescript
function Timeline() {
  const [state, setState] = useAtom(timelineAtom, { mode: "promise" })
  const appendPlays = useAtomSet(appendPlaysAtom, { mode: "promise" })

  const loadMore = async () => {
    if (state.cursor && !state.isLoading) {
      const newState = await appendPlays(state.cursor)
      setState(newState)
    }
  }

  return <button onClick={loadMore}>Load More</button>
}
```

---

## Reading Result Atoms

**Tutorial 6: get.result**
*Combine two independent async Results—fetch data, calculate from multiple Result atoms*

### Pattern: Reading Result Atoms

When reading atoms that return `Result<A, E>`, use `get.result()` instead of plain `get()`.

```typescript
// These atoms return Result<number, Error>
const booksAtom = Atom.make(() => fetchBooks())
const lifespanAtom = Atom.make(() => fetchLifespan())

// Combine Results using get.result()
const productivityAtom = Atom.make((get) =>
  Effect.gen(function* () {
    // get.result() unwraps Result atoms
    const books = yield* get.result(booksAtom)
    const years = yield* get.result(lifespanAtom)

    return books / years  // Returns Result<number, Error>
  })
)
```

**Key Difference:**

```typescript
// ❌ WRONG - tries to access Result object directly
const wrongAtom = Atom.make((get) => {
  const result = get(resultAtom)  // Result<A, E>
  return result.value  // Error: Result doesn't work this way
})

// ✅ CORRECT - unwraps Result in Effect context
const rightAtom = Atom.make((get) =>
  Effect.gen(function* () {
    const value = yield* get.result(resultAtom)  // A
    return value * 2
  })
)
```

**Real-world example:**

```typescript
// Background sync - reads stream atom using get.result()
export const syncTimelineToStorage = httpRuntime.fn<void>()(
  (_, get) => Effect.gen(function* () {
    // timelineStreamAtom returns Result<TimelineState, Error>
    const streamResult = yield* get.result(timelineStreamAtom)

    return streamResult  // Unwrapped TimelineState
  })
)
```

---

## Optimistic Updates

**Tutorial 7: Atom.optimistic**
*Instant UI updates—updates immediately, tracks mutation state, rolls back on failure*

### Pattern: Optimistic Mutations

Optimistic updates show changes immediately while the async operation runs in the background.

```typescript
// Server mutation function
const updateLikesAtom = Atom.fn<number>()(
  (postId, get) => Effect.gen(function* () {
    yield* Effect.sleep("1 second")  // Simulated network delay

    const client = yield* HttpClient.HttpClient
    yield* client.post(`/api/posts/${postId}/like`)

    return { postId, liked: true }
  })
)

// Optimistic wrapper - updates immediately, rolls back on error
const optimisticLikeAtom = Atom.optimistic(
  likesAtom,           // Source atom to update
  updateLikesAtom,     // Async mutation function
  {
    // Optimistic updater - runs IMMEDIATELY
    update: (currentState, postId) => ({
      ...currentState,
      liked: true,
      likes: currentState.likes + 1
    })
  }
)
```

**Usage in components:**

```typescript
function Post({ postId }) {
  const [state] = useAtom(likesAtom)
  const like = useAtomSet(optimisticLikeAtom)

  // Shows liked state immediately, even during network request
  return (
    <button onClick={() => like(postId)}>
      {state.liked ? "❤️" : "🤍"} {state.likes}
    </button>
  )
}
```

**Key Points:**
- UI updates **instantly** with optimistic value
- Automatically **rolls back** if mutation fails
- Tracks mutation state (pending, success, error)
- Perfect for like buttons, todo toggles, etc.

### Pattern: Optimistic Function

For more complex mutations that don't modify a single atom:

```typescript
const optimisticDeleteTodo = Atom.optimisticFn(
  deleteTodoAtom,  // Mutation function
  {
    update: (_, todoId) => {
      // Custom logic to update multiple atoms
      // This runs immediately, before network request
    },
    rollback: () => {
      // Custom logic to undo changes on error
    }
  }
)
```

---

## Real-World Patterns

**Tutorial 8 & 9: Todo List Examples**
*Effect.Service with internal state, Atom.runtime, Atom.family, filtering, mutations*

### Pattern: Service-Based State Management

For complex state, use Effect Services with atoms.

```typescript
// Define service
class TodoService extends Effect.Service<TodoService>()("TodoService", {
  effect: Effect.gen(function* () {
    // Internal state (SynchronizedRef)
    const todosRef = yield* SynchronizedRef.make<Todo[]>([])

    return {
      // Methods that modify state
      addTodo: (text: string) =>
        SynchronizedRef.updateEffect(todosRef, (todos) =>
          Effect.succeed([...todos, { id: uuid(), text, completed: false }])
        ),

      toggleTodo: (id: string) =>
        SynchronizedRef.updateEffect(todosRef, (todos) =>
          Effect.succeed(
            todos.map(todo =>
              todo.id === id ? { ...todo, completed: !todo.completed } : todo
            )
          )
        ),

      getTodos: () => SynchronizedRef.get(todosRef)
    }
  })
}) {}

// Create runtime with service
const TodoLive = Layer.succeed(TodoService, new TodoService.Service(...))
const todoRuntime = Atom.runtime(TodoLive)
```

### Pattern: Atom Family (Per-Item Atoms)

Create atoms dynamically for each item in a collection.

```typescript
// Family of atoms - one atom per todo ID
const todoAtomFamily = Atom.family((id: string) =>
  todoRuntime.make((get) =>
    Effect.gen(function* () {
      const service = yield* TodoService
      const todos = yield* service.getTodos()
      return todos.find(t => t.id === id)
    })
  )
)

// Usage
function TodoItem({ id }) {
  const todo = useAtomValue(todoAtomFamily(id))
  // ...
}
```

### Pattern: Filter + Derive

Combine filter state with derived filtering.

```typescript
// Filter state
const filterAtom = Atom.make<FilterType>("all")

// Todos atom (from service)
const todosAtom = todoRuntime.make((get) =>
  Effect.gen(function* () {
    const service = yield* TodoService
    return yield* service.getTodos()
  })
)

// Filtered todos - derives from both
const filteredTodosAtom = Atom.make((get) => {
  const filter = get(filterAtom)

  return Effect.gen(function* () {
    const todos = yield* get.result(todosAtom)

    switch (filter) {
      case "done": return todos.filter(t => t.completed)
      case "open": return todos.filter(t => !t.completed)
      default: return todos
    }
  })
})
```

### Pattern: Persisted Atoms

Use `Atom.kvs` for automatic localStorage persistence.

```typescript
// Atom that automatically saves to localStorage
const persistedTimelineAtom = Atom.kvs({
  runtime: localStorageRuntime,
  key: "timeline-state",
  schema: TimelineState,
  defaultValue: () => new TimelineState({
    plays: [],
    cursor: null,
    hasMore: false,
    isLoading: false,
    error: null
  })
})
```

**Key Points:**
- Reads from localStorage on mount
- Automatically writes on every update
- Uses Schema for serialization
- Requires BrowserKeyValueStore runtime

### Pattern: Event-Driven Atoms

Atoms that react to DOM events.

```typescript
// Tracks window scroll position
export const scrollYAtom = Atom.make((get) => {
  const onScroll = () => {
    get.setSelf(window.scrollY)  // Update self from within
  }

  // Subscribe to event
  if (typeof window !== "undefined") {
    window.addEventListener("scroll", onScroll)
    // Cleanup when atom is unmounted
    get.addFinalizer(() => window.removeEventListener("scroll", onScroll))
  }

  return typeof window !== "undefined" ? window.scrollY : 0
})
```

**Key Points:**
- `get.setSelf()` updates the atom from within its own getter
- `get.addFinalizer()` registers cleanup functions
- Perfect for event listeners, intervals, etc.

---

## Runtime Configuration

### Pattern: HTTP Runtime

Configure Effect runtime with services for atoms to use.

```typescript
// Create HTTP client layer
const configuredHttpLayer = Layer.effect(
  HttpClient.HttpClient,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    return HttpClient.mapRequest(
      client,
      HttpClientRequest.prependUrl("http://localhost:8000")
    )
  })
).pipe(Layer.provide(FetchHttpClient.layer))

// Create runtime from layer
export const httpRuntime = Atom.runtime(configuredHttpLayer)
```

### Pattern: Runtime Atoms

Create atoms that have access to runtime services.

```typescript
// Atom using httpRuntime's HttpClient
const dataAtom = httpRuntime.atom(
  Stream.fromSchedule(Schedule.spaced("2 minutes")).pipe(
    Stream.flatMap(() => Stream.fromEffect(fetchEffect))
  )
).pipe(Atom.keepAlive)
```

**Key Points:**
- `runtime.atom()` - atom with access to runtime services
- `runtime.fn()` - function atom with runtime services
- `runtime.make()` - basic atom with runtime services
- Separate runtimes for HTTP, localStorage, etc.

---

## Component Patterns

### Reading Atoms

```typescript
// Read-only value
const value = useAtomValue(myAtom)

// Read + write (non-Result)
const [value, setValue] = useAtom(writableAtom)

// Read + write (Result atom)
const [result, setResult] = useAtom(resultAtom, { mode: "promise" })

// Only write
const setValue = useAtomSet(writableAtom)
```

### Mode Options

```typescript
// Default: returns Result object
const result = useAtomValue(resultAtom)
// result: Result<A, E>

// Promise mode: auto-suspends, throws errors
const value = useAtomValue(resultAtom, { mode: "promise" })
// value: A (suspends while loading)

// PromiseExit mode: returns Exit
const exit = useAtomValue(resultAtom, { mode: "promiseExit" })
// exit: Exit<A, E>
```

---

## Best Practices

### ✅ DO

1. **Use derived atoms** for computed values instead of duplicating logic
2. **Use `get.result()`** when reading Result-returning atoms
3. **Use `runtime.fn()`** for mutations that need services
4. **Use optimistic updates** for instant UI feedback
5. **Use Atom.kvs** for persisting state to localStorage
6. **Track dependencies** explicitly with `get()`
7. **Clean up** side effects with `get.addFinalizer()`

### ❌ DON'T

1. **Don't** try to write to derived atoms (they're read-only)
2. **Don't** use plain `get()` on Result atoms (use `get.result()`)
3. **Don't** forget to handle errors in Result atoms
4. **Don't** create atoms inside components (define at module level)
5. **Don't** mutate atom values directly (use setter)
6. **Don't** forget cleanup for event listeners or intervals

---

## Common Pitfalls

### Pitfall: Reading Result Atoms Wrong

```typescript
// ❌ WRONG
const badAtom = Atom.make((get) => {
  const result = get(resultAtom)  // Result<number, E>
  return result + 1  // Error: can't add to Result
})

// ✅ CORRECT
const goodAtom = Atom.make((get) =>
  Effect.gen(function* () {
    const value = yield* get.result(resultAtom)  // number
    return value + 1
  })
)
```

### Pitfall: Not Tracking Dependencies

```typescript
// ❌ BAD - doesn't track countAtom
const badAtom = Atom.make(() => {
  return countAtom.value * 2  // Won't update when count changes
})

// ✅ GOOD - tracks countAtom
const goodAtom = Atom.make((get) => {
  return get(countAtom) * 2  // Recomputes when count changes
})
```

### Pitfall: Side Effects Without Cleanup

```typescript
// ❌ BAD - leaks memory
const badAtom = Atom.make((get) => {
  setInterval(() => console.log("tick"), 1000)
  return 0
})

// ✅ GOOD - cleans up interval
const goodAtom = Atom.make((get) => {
  const id = setInterval(() => console.log("tick"), 1000)
  get.addFinalizer(() => clearInterval(id))
  return 0
})
```

---

## Migration Guide

### From React State

```typescript
// Before
const [count, setCount] = useState(0)
const doubled = count * 2

// After
const countAtom = Atom.make(0)
const doubledAtom = Atom.make((get) => get(countAtom) * 2)

function Component() {
  const [count, setCount] = useAtom(countAtom)
  const doubled = useAtomValue(doubledAtom)
}
```

### From Jotai

Effect Atom is similar to Jotai but with first-class Effect support:

```typescript
// Jotai
const asyncAtom = atom(async (get) => {
  const value = get(otherAtom)
  const response = await fetch(`/api/${value}`)
  return response.json()
})

// Effect Atom (better error handling)
const asyncAtom = Atom.make((get) =>
  Effect.gen(function* () {
    const value = get(otherAtom)
    const client = yield* HttpClient.HttpClient
    const response = yield* client.get(`/api/${value}`)
    return yield* HttpClientResponse.schemaBodyJson(Schema)(response)
  })
)
```

---

## Summary

Effect Atom provides:
- **Reactive state** that automatically updates
- **Effect integration** for async operations with full error handling
- **Type safety** through Schema and Effect types
- **Composability** through derived atoms and services
- **Performance** through fine-grained reactivity
- **Persistence** through localStorage integration
- **Testing** through runtime isolation

Use it for:
- Complex async state management
- HTTP requests with proper error handling
- Persisted UI state
- Derived/computed values
- Optimistic mutations
- Background sync operations

---

## Further Reading

- [Effect Atom Examples](https://effect-atom.kitlangton.com) - Interactive tutorials
- [Effect Atom GitHub](https://github.com/tim-smart/effect-atom) - Source code and docs
- [Effect Documentation](https://effect.website) - Core Effect-TS concepts
- [Our Timeline Implementation](/packages/web/src/atoms/timeline.ts) - Real-world example

---

**Last Updated:** 2025-01-12
**Based On:** Effect Atom v1.x tutorials + KXP crate implementation
