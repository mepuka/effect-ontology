# Enterprise UI Framework Integration Plan

**Date:** 2025-11-21
**Status:** Planning
**Goal:** Bootstrap frontend with enterprise UI frameworks while preserving atom-based Effect service management

---

## Current Architecture Analysis

### What We Have (Strengths)
- ✅ **Radix UI primitives** - Headless accessible components (Tooltip, Slot)
- ✅ **Tailwind CSS 4.1.17** - Custom design system with depth colors
- ✅ **Atom-based Effect state** - Mature pattern with `runtime.atom()` and `@effect-atom`
- ✅ **React 19.2.0** - Latest stable React
- ✅ **Vite 7.2.2** - Fast build tooling
- ✅ **Effect 3.19.6** - Full Effect-TS runtime with Layer composition

### What We're Missing (Opportunities)
- ❌ **No routing** - Single-page app only, need multi-page navigation
- ❌ **No component library** - Custom components, no buttons/forms/dialogs/etc.
- ❌ **No data grid** - For viewing extraction results (large datasets)
- ❌ **No form library** - Manual form state management
- ❌ **No toast/notification system** - Inline feedback only

---

## Framework Evaluation Results

### UI Component Libraries

| Framework | Pros | Cons | Verdict |
|-----------|------|------|---------|
| **shadcn/ui** | • Already have Radix + Tailwind<br>• Copy-paste, full control<br>• No package lock-in<br>• 66k stars, trending | • Manual component installation<br>• Less comprehensive than Ant/MUI | ✅ **RECOMMENDED** |
| **Ant Design** | • Enterprise-focused<br>• 65+ components<br>• Comprehensive design system | • Different design language<br>• Bundle size<br>• Conflicts with Tailwind | ❌ Skip (wrong design system) |
| **MUI** | • Most popular (95k stars)<br>• Material Design<br>• Corporate backing | • Heavy bundle (200KB+)<br>• Material Design opinionated<br>• Conflicts with Tailwind | ❌ Skip (design conflict) |

**Decision:** **shadcn/ui** - Natural fit because we already have Radix UI and Tailwind CSS.

### Routing Solutions

| Framework | Pros | Cons | Verdict |
|-----------|------|------|---------|
| **TanStack Router** | • Type-safe routing<br>• Works with atoms<br>• Search params as state<br>• Modern API | • Newer library<br>• Smaller ecosystem | ✅ **RECOMMENDED** |
| **React Router v7** | • Industry standard<br>• Mature ecosystem<br>• Remix integration | • Less type-safe<br>• Larger API surface | ⚠️ Alternative |
| **wouter** | • Tiny (1.5KB)<br>• Hook-based | • Too minimal for enterprise | ❌ Skip (too simple) |

**Decision:** **TanStack Router** - Type-safe, modern, works well with atom-based architecture.

### Data Grid Solutions

| Framework | Use Case | Dataset Size | Cost | Verdict |
|-----------|----------|--------------|------|---------|
| **TanStack Table** | Most views | < 10,000 rows | Free | ✅ **PRIMARY** |
| **AG Grid** | Large extraction results | 100,000+ rows | $999+/dev | ✅ **SECONDARY** (when needed) |
| **MUI Data Grid** | - | - | - | ❌ Skip (design conflict) |

**Decision:**
- **TanStack Table** for most use cases (lightweight, headless, free)
- **AG Grid Community** only if we need 100k+ row grids for extraction results

### Meta-Framework Consideration: Refine

**Why NOT Refine:**
- ❌ Too opinionated about data fetching (conflicts with atoms)
- ❌ Assumes REST/GraphQL backend (we have atoms + Effect)
- ❌ Manages routing/state internally (we want atoms to own state)
- ❌ Designed for admin panels, not specialized ontology tools

**Our approach is better:** Keep atoms for Effect service orchestration, add routing + UI components independently.

---

## Recommended Stack

### Core Framework
- **React 19.2.0** (keep)
- **Vite 7.2.2** (keep)
- **TypeScript 5.6.2** (keep)
- **Bun 1.2.23** (keep)

### State Management
- **@effect-atom/atom** (keep)
- **@effect-atom/atom-react** (keep)
- **Effect 3.19.6** (keep)

### Routing
- **@tanstack/react-router** (add)

### UI Components
- **shadcn/ui** (add) - Built on Radix + Tailwind (already have)
- **Radix UI** (keep, expand)
- **Tailwind CSS** (keep)
- **Framer Motion** (keep)
- **Lucide React** (keep)

### Data Tables
- **@tanstack/react-table** (add) - Primary data grid
- **@tanstack/react-virtual** (add) - Virtualization for large lists
- **ag-grid-react** (add only if needed) - Enterprise grid for 100k+ rows

### Forms
- **React Hook Form** (add) + **@hookform/resolvers** for Effect Schema validation

### Notifications
- **sonner** (add) - Toast notifications (works with shadcn/ui)

---

## Implementation Plan

### Phase 1: Add shadcn/ui Foundation (Day 1)

**Goal:** Install shadcn/ui and add core components

**Steps:**
1. Initialize shadcn/ui (updates `components.json`)
   ```bash
   bunx shadcn@latest init
   ```

2. Install core components:
   ```bash
   bunx shadcn@latest add button
   bunx shadcn@latest add card
   bunx shadcn@latest add dialog
   bunx shadcn@latest add dropdown-menu
   bunx shadcn@latest add input
   bunx shadcn@latest add label
   bunx shadcn@latest add select
   bunx shadcn@latest add tabs
   bunx shadcn@latest add toast
   bunx shadcn@latest add form
   ```

3. Verify Tailwind config compatibility
4. Test components in isolation

**Files created:**
- `packages/ui/components.json` - shadcn config
- `packages/ui/src/components/ui/*` - Component files
- `packages/ui/src/lib/utils.ts` - Utility helpers (cn, etc.)

**Testing:**
- Create `packages/ui/src/components/demos/ButtonDemo.tsx`
- Verify all variants work with existing Tailwind theme

### Phase 2: Add Routing with TanStack Router (Day 1-2)

**Goal:** Add multi-page navigation while preserving atoms

**Steps:**
1. Install TanStack Router:
   ```bash
   cd packages/ui
   bun add @tanstack/react-router @tanstack/router-devtools
   bun add -d @tanstack/router-plugin @tanstack/router-cli
   ```

2. Configure Vite plugin:
   ```typescript
   // packages/ui/vite.config.ts
   import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

   export default defineConfig({
     plugins: [
       TanStackRouterVite(),
       react(),
       // ... existing plugins
     ]
   })
   ```

3. Create route structure:
   ```
   packages/ui/src/routes/
   ├── __root.tsx          # Root layout
   ├── index.tsx           # Home (current app)
   ├── ontology/
   │   ├── index.tsx       # Ontology editor (move current App.tsx)
   │   └── $id.tsx         # Specific ontology
   ├── extractions/
   │   ├── index.tsx       # Extraction runs list
   │   └── $runId.tsx      # Run details
   └── settings.tsx        # Settings page
   ```

4. Create router instance:
   ```typescript
   // packages/ui/src/router.ts
   import { createRouter } from '@tanstack/react-router'
   import { routeTree } from './routeTree.gen'

   export const router = createRouter({ routeTree })
   ```

5. Update main.tsx:
   ```typescript
   import { RouterProvider } from '@tanstack/react-router'
   import { router } from './router'

   <RegistryProvider>
     <RouterProvider router={router} />
   </RegistryProvider>
   ```

**Atoms integration:**
- Atoms remain global (no changes needed)
- Routes can `useAtomValue()` as before
- URL params can sync to atoms if needed:
  ```typescript
  // Example: Sync URL param to atom
  const { id } = Route.useParams()
  useEffect(() => {
    Atom.set(selectedOntologyIdAtom, id)
  }, [id])
  ```

**Testing:**
- Verify navigation works
- Ensure atoms persist across route changes
- Test browser back/forward

### Phase 3: Add TanStack Table for Data Grids (Day 2)

**Goal:** Create reusable table component for extraction results

**Steps:**
1. Install dependencies:
   ```bash
   cd packages/ui
   bun add @tanstack/react-table @tanstack/react-virtual
   ```

2. Create generic table component:
   ```typescript
   // packages/ui/src/components/DataTable.tsx
   import { useReactTable } from '@tanstack/react-table'
   import { Table, TableHeader, TableBody, TableRow, TableCell } from '@/components/ui/table'

   export function DataTable<TData>({
     data,
     columns,
   }: DataTableProps<TData>) {
     const table = useReactTable({
       data,
       columns,
       getCoreRowModel: getCoreRowModel(),
       getSortedRowModel: getSortedRowModel(),
       getFilteredRowModel: getFilteredRowModel(),
     })

     return (
       <Table>
         <TableHeader>
           {table.getHeaderGroups().map(headerGroup => (
             <TableRow key={headerGroup.id}>
               {headerGroup.headers.map(header => (
                 <TableCell key={header.id}>
                   {/* Render header with sorting */}
                 </TableCell>
               ))}
             </TableRow>
           ))}
         </TableHeader>
         <TableBody>
           {/* Render rows */}
         </TableBody>
       </Table>
     )
   }
   ```

3. Add shadcn table component:
   ```bash
   bunx shadcn@latest add table
   ```

4. Create extraction results view:
   ```typescript
   // packages/ui/src/routes/extractions/$runId.tsx
   export const Route = createFileRoute('/extractions/$runId')({
     component: ExtractionRunDetails
   })

   function ExtractionRunDetails() {
     const { runId } = Route.useParams()
     const result = useAtomValue(extractionResultAtom(runId))

     return (
       <div>
         <h1>Extraction Run {runId}</h1>
         <DataTable
           data={result.entities}
           columns={entityColumns}
         />
       </div>
     )
   }
   ```

**Atoms integration:**
- Create `extractionResultAtom` that takes runId parameter
- Table reads from atom via `useAtomValue()`
- Sorting/filtering state can be local or in atoms

**Testing:**
- Test with small dataset (< 100 rows)
- Test with medium dataset (1,000 rows)
- Measure performance, add virtualization if needed

### Phase 4: Add Form Library (Day 3)

**Goal:** Replace manual form state with React Hook Form + Effect Schema

**Steps:**
1. Install dependencies:
   ```bash
   cd packages/ui
   bun add react-hook-form @hookform/resolvers
   ```

2. Create Effect Schema resolver:
   ```typescript
   // packages/ui/src/lib/effect-schema-resolver.ts
   import { Schema } from '@effect/schema'
   import { Effect } from 'effect'

   export const effectSchemaResolver = (schema: Schema.Schema<any, any>) => {
     return async (data: any) => {
       const result = await Effect.runPromise(
         Schema.decodeUnknown(schema)(data)
           .pipe(Effect.either)
       )

       if (Either.isLeft(result)) {
         return {
           values: {},
           errors: formatSchemaErrors(result.left)
         }
       }

       return { values: result.right, errors: {} }
     }
   }
   ```

3. Refactor SettingsPanel to use React Hook Form:
   ```typescript
   // packages/ui/src/components/SettingsPanel.tsx
   import { useForm } from 'react-hook-form'
   import { LlmProviderParamsSchema } from '@effect-ontology/core/Services/LlmProvider'

   function SettingsPanel() {
     const config = useAtomValue(browserConfigAtom)
     const { register, handleSubmit, formState: { errors } } = useForm({
       defaultValues: config,
       resolver: effectSchemaResolver(LlmProviderParamsSchema)
     })

     const onSubmit = (data) => {
       Atom.set(browserConfigAtom, data)
     }

     return (
       <form onSubmit={handleSubmit(onSubmit)}>
         <Input {...register('anthropic.apiKey')} />
         {errors.anthropic?.apiKey && <span>{errors.anthropic.apiKey.message}</span>}
         {/* ... */}
       </form>
     )
   }
   ```

4. Add shadcn form components:
   ```bash
   bunx shadcn@latest add form
   ```

**Benefits:**
- Type-safe form state with Effect Schema
- Automatic validation
- Better error handling
- Less boilerplate

**Testing:**
- Test validation with invalid inputs
- Test submission flow
- Verify atom updates work correctly

### Phase 5: Add Toast Notifications (Day 3)

**Goal:** Replace inline feedback with toast notifications

**Steps:**
1. Install sonner:
   ```bash
   cd packages/ui
   bunx shadcn@latest add sonner
   ```

2. Add Toaster to root layout:
   ```typescript
   // packages/ui/src/routes/__root.tsx
   import { Toaster } from '@/components/ui/sonner'

   export const Route = createRootRoute({
     component: () => (
       <>
         <Outlet />
         <Toaster />
       </>
     )
   })
   ```

3. Use toasts for feedback:
   ```typescript
   import { toast } from 'sonner'

   function SaveButton() {
     const handleSave = () => {
       toast.promise(
         saveToBackend(),
         {
           loading: 'Saving...',
           success: 'Saved successfully!',
           error: 'Failed to save'
         }
       )
     }
   }
   ```

4. Create Effect → Toast helper:
   ```typescript
   // packages/ui/src/lib/toast-effect.ts
   export const toastEffect = <A, E>(
     effect: Effect.Effect<A, E>,
     messages: {
       loading: string
       success: string | ((value: A) => string)
       error: string | ((error: E) => string)
     }
   ) => {
     return toast.promise(
       Effect.runPromise(effect),
       messages
     )
   }
   ```

**Usage with atoms:**
```typescript
const extractionAtom = runtime.atom((get) =>
  Effect.gen(function*() {
    const result = yield* extractKnowledgeGraph(...)
    toast.success('Extraction complete!')
    return result
  })
)
```

### Phase 6: Create Extraction Studio Routes (Day 4)

**Goal:** Build the multi-page "studio" for viewing extractions

**Routes structure:**
```
/                         # Home/Dashboard
/ontology                 # Current app (RDF editor + visualization)
/extractions              # List of extraction runs
/extractions/:runId       # Run details (operations + data)
/extractions/:runId/dag   # Operations DAG view
/extractions/:runId/data  # Tabular data view
/settings                 # Settings page
```

**Extraction List Page (`/extractions`):**
```typescript
// packages/ui/src/routes/extractions/index.tsx
import { DataTable } from '@/components/DataTable'
import { Button } from '@/components/ui/button'

function ExtractionsList() {
  const runs = useAtomValue(extractionRunsAtom)

  return (
    <div className="container py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Extraction Runs</h1>
        <Button onClick={startNewExtraction}>
          New Extraction
        </Button>
      </div>

      <DataTable
        data={runs}
        columns={[
          { accessorKey: 'id', header: 'Run ID' },
          { accessorKey: 'status', header: 'Status' },
          { accessorKey: 'startedAt', header: 'Started' },
          { accessorKey: 'entitiesExtracted', header: 'Entities' },
        ]}
      />
    </div>
  )
}
```

**Extraction Details Page (`/extractions/:runId`):**
```typescript
// packages/ui/src/routes/extractions/$runId.tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

function ExtractionRunDetails() {
  const { runId } = Route.useParams()
  const run = useAtomValue(extractionRunAtom(runId))

  return (
    <div className="container py-8">
      <h1 className="text-2xl font-bold mb-4">
        Run {runId}
      </h1>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <RunOverview run={run} />
        </TabsContent>

        <TabsContent value="operations">
          <OperationsDAG runId={runId} />
        </TabsContent>

        <TabsContent value="data">
          <ExtractedDataTable runId={runId} />
        </TabsContent>

        <TabsContent value="logs">
          <RunLogs runId={runId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

**Operations DAG Component:**
```typescript
// packages/ui/src/components/OperationsDAG.tsx
import ReactFlow, { Background, Controls } from 'reactflow'
import 'reactflow/dist/style.css'

export function OperationsDAG({ runId }: { runId: string }) {
  const operations = useAtomValue(operationsAtom(runId))

  // Convert operations to ReactFlow nodes/edges
  const nodes = operations.map(op => ({
    id: op.id,
    type: 'custom',
    position: calculatePosition(op), // Use dagre or elkjs
    data: { label: op.name, status: op.status }
  }))

  return (
    <div className="h-[600px] border rounded">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}
```

### Phase 7: Add AG Grid (Optional, Day 5)

**Only if needed for 100k+ row datasets**

**Steps:**
1. Install AG Grid:
   ```bash
   cd packages/ui
   bun add ag-grid-react ag-grid-community
   ```

2. Create AG Grid wrapper:
   ```typescript
   // packages/ui/src/components/LargeDataGrid.tsx
   import { AgGridReact } from 'ag-grid-react'
   import 'ag-grid-community/styles/ag-grid.css'
   import 'ag-grid-community/styles/ag-theme-alpine.css'

   export function LargeDataGrid({ data, columns }) {
     return (
       <div className="ag-theme-alpine h-[600px]">
         <AgGridReact
           rowData={data}
           columnDefs={columns}
           pagination={true}
           paginationPageSize={100}
         />
       </div>
     )
   }
   ```

3. Use conditionally:
   ```typescript
   // Use TanStack Table for small datasets
   if (data.length < 10000) {
     return <DataTable data={data} columns={columns} />
   }

   // Use AG Grid for large datasets
   return <LargeDataGrid data={data} columns={columns} />
   ```

---

## Architecture Integration

### How Atoms Work with New Stack

**TanStack Router + Atoms:**
```typescript
// Route definition
export const Route = createFileRoute('/extractions/$runId')({
  component: ExtractionDetails
})

// Component uses atoms
function ExtractionDetails() {
  const { runId } = Route.useParams()

  // Atoms can depend on route params
  const runAtom = useMemo(
    () => runtime.atom((get) =>
      Effect.gen(function*() {
        return yield* loadExtractionRun(runId)
      })
    ),
    [runId]
  )

  const result = useAtomValue(runAtom)

  return (
    <Result.match result={result}
      onSuccess={(run) => <RunView run={run} />}
      onFailure={(error) => <ErrorView error={error} />}
      onInitial={() => <Loading />}
    />
  )
}
```

**Forms + Atoms:**
```typescript
// React Hook Form reads from atom
const config = useAtomValue(configAtom)
const { register, handleSubmit } = useForm({ defaultValues: config })

// On submit, update atom
const onSubmit = (data) => {
  Atom.set(configAtom, data)
}
```

**Tables + Atoms:**
```typescript
// Table data comes from atom
const entities = useAtomValue(extractedEntitiesAtom)

// Table sorting/filtering can update atom
const [sorting, setSorting] = useState([])
useEffect(() => {
  Atom.set(sortingAtom, sorting)
}, [sorting])
```

### Layer Composition Pattern

**No changes needed!** Atoms continue to compose layers inline:

```typescript
export const extractionAtom = runtime.atom((get) =>
  Effect.gen(function*() {
    const params = get(browserConfigAtom)
    const providerLayer = makeLlmProviderLayer(params)

    return yield* extractKnowledgeGraph(...)
      .pipe(Effect.provide(providerLayer))
  })
)
```

### Effect Services in New Architecture

**Services remain in FrontendRuntimeLayer:**
```typescript
export const FrontendRuntimeLayer = Layer.mergeAll(
  RdfService.Default,
  ShaclService.Default,
  BrowserKeyValueStore.layerLocalStorage
)

export const runtime = Runtime.atom(FrontendRuntimeLayer)
```

**LLM provider layers composed per-call:**
```typescript
const providerLayer = makeLlmProviderLayer(params)
Effect.provide(providerLayer)
```

---

## Migration Strategy

### Phase-by-Phase Approach

**Phase 1-2 (Routing + shadcn):** Non-breaking
- Add routing alongside existing app
- Keep current app at `/ontology`
- New routes don't affect existing functionality

**Phase 3 (Tables):** Non-breaking
- Add DataTable component
- Use in new routes only
- Existing visualizations unchanged

**Phase 4 (Forms):** Breaking for SettingsPanel
- Refactor SettingsPanel to use React Hook Form
- Test thoroughly before merging

**Phase 5 (Toasts):** Non-breaking
- Add toast provider
- Gradually replace inline feedback

**Phase 6 (Studio Routes):** New functionality
- Build extraction studio pages
- No impact on existing ontology editor

**Phase 7 (AG Grid):** Optional, non-breaking

### Testing Strategy

**Unit Tests:**
- Test components with @testing-library/react
- Mock atoms using `Atom.make()` with test values

**Integration Tests:**
- Test route navigation
- Test form submission → atom updates
- Test table filtering/sorting

**E2E Tests:**
- Test full user flows (e.g., create extraction → view results)
- Use Playwright or Cypress

---

## Bundle Size Impact

### Current Bundle (estimated)
- React + React DOM: ~140KB
- Effect runtime: ~100KB
- Tailwind (purged): ~10KB
- Radix UI primitives: ~20KB
- Custom components: ~50KB
- **Total: ~320KB**

### After Adding New Stack (estimated)
- shadcn/ui components: ~30KB (copy-paste, only what we use)
- TanStack Router: ~15KB
- TanStack Table: ~30KB
- React Hook Form: ~25KB
- Sonner: ~5KB
- ReactFlow (if added): ~80KB
- **Total additional: ~185KB**
- **New total: ~505KB**

### Optimization Strategies
- Code splitting by route (Vite does this automatically)
- Lazy load AG Grid only when needed
- Tree-shake unused shadcn components
- Dynamic imports for heavy components (ReactFlow)

---

## Timeline

| Phase | Duration | Dependencies | Output |
|-------|----------|--------------|--------|
| 1. shadcn/ui | 4 hours | None | Core UI components installed |
| 2. Routing | 8 hours | Phase 1 | Multi-page navigation working |
| 3. Tables | 6 hours | Phase 1 | DataTable component + extraction list |
| 4. Forms | 4 hours | Phase 1 | React Hook Form + Effect Schema |
| 5. Toasts | 2 hours | Phase 1 | Toast notifications |
| 6. Studio | 16 hours | Phases 1-5 | Full extraction studio |
| 7. AG Grid | 4 hours | Phase 3 | Large dataset support |
| **Total** | **44 hours** (~5.5 days) | | **Production-ready UI** |

---

## Success Criteria

### Phase 1-2 Success
- [ ] shadcn/ui components installed and working
- [ ] TanStack Router configured
- [ ] Can navigate between routes
- [ ] Atoms work across route changes
- [ ] Existing ontology editor works at `/ontology`

### Phase 3 Success
- [ ] DataTable component renders 1,000+ rows
- [ ] Sorting and filtering work
- [ ] Performance is acceptable (< 100ms render)
- [ ] Integrates with atoms

### Phase 4 Success
- [ ] SettingsPanel uses React Hook Form
- [ ] Effect Schema validation works
- [ ] Form submission updates atoms
- [ ] Error messages display correctly

### Phase 5 Success
- [ ] Toasts appear on actions
- [ ] Success/error states clear
- [ ] No duplicate toasts

### Phase 6 Success
- [ ] Extraction list page works
- [ ] Extraction details page shows overview
- [ ] Operations DAG renders (even if basic)
- [ ] Data table shows extracted entities
- [ ] Navigation between pages smooth

### Phase 7 Success (if needed)
- [ ] AG Grid handles 100k+ rows
- [ ] Performance acceptable
- [ ] Conditional rendering works

---

## Risk Mitigation

### Risk: Breaking Existing Functionality
**Mitigation:** Add new features in new routes, keep existing routes unchanged until Phase 6.

### Risk: Bundle Size Bloat
**Mitigation:** Code splitting, lazy loading, careful component selection.

### Risk: Routing Conflicts with Atoms
**Mitigation:** Test atom persistence across routes early (Phase 2).

### Risk: TanStack Table Performance
**Mitigation:** Benchmark with real data, have AG Grid as fallback plan.

### Risk: Learning Curve
**Mitigation:** Start with shadcn/ui docs, TanStack Router docs, follow examples.

---

## Next Steps

1. **Review this plan** - Confirm approach aligns with goals
2. **Start Phase 1** - Initialize shadcn/ui and install core components
3. **Prototype routing** - Create basic route structure in Phase 2
4. **Build DataTable** - Create reusable table component in Phase 3
5. **Iterate** - Get feedback, adjust plan as needed

---

## References

### Documentation
- shadcn/ui: https://ui.shadcn.com/
- TanStack Router: https://tanstack.com/router/latest
- TanStack Table: https://tanstack.com/table/latest
- React Hook Form: https://react-hook-form.com/
- AG Grid: https://www.ag-grid.com/react-data-grid/

### Examples
- shadcn + TanStack Router: https://github.com/shadcn-ui/ui/discussions/1723
- TanStack Table + shadcn: https://ui.shadcn.com/docs/components/data-table
- Effect + React Hook Form: Custom resolver needed (see Phase 4)

### Internal References
- Current UI architecture: `packages/ui/src/`
- Atom patterns: `packages/ui/src/runtime/atoms.ts`
- Layer composition: `packages/ui/src/runtime/layers.ts`
- LLM provider: `packages/core/src/Services/LlmProvider.ts`
