# <Feature/Version> State Machine Contract

Version:  
Status:  
Audience:

---

## 1. Purpose

- Define deterministic UI state behavior.
- Freeze mapping from source signals to render states.

## 2. Types

```ts
type UiState =
  | "idle"
  | "loading"
  | "ready"
  | "error";
```

```ts
type PhaseState =
  | "phase_a"
  | "phase_b"
  | "phase_c";
```

## 3. Source Signals

1.
2.
3.

## 4. Mapping Rules

1.
2.
3.

## 5. Transition Rules

1. Initial:
2. User-triggered:
3. Success terminal:
4. Error and retry:
5. Fast/slow async convergence:

## 6. Render Contract

### idle

- Must show:
- Must hide:

### loading

- Must show:
- Preserve policy:

### ready

- Must show:
- Optional sections policy:

### error

- Must show:
- Retry behavior:

## 7. Compatibility and Deferred Integration

- Current protocol/source:
- Future bridge slot:
- Explicitly deferred:

## 8. Non-goals

1.
2.

