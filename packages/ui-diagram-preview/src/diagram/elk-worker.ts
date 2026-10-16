// @ts-nocheck
// Import the raw elk-worker script which registers itself on `self`/`$wnd`
// and exposes a FakeWorker that wraps the algorithm as a Worker-like API.
// We use it directly to run ELK layout inside this real Web Worker.
import 'elkjs/lib/elk-worker.min.js'

// After importing, the script sets module.exports or self.Worker
// In a Vite worker context, `self` should have the algorithm available
// The FakeWorker constructor is available and handles postMessage internally

// elk-worker.min.js sets up a message handler on the FakeWorker
// We need to bridge: real Worker messages ↔ FakeWorker

// Actually, elk-worker.min.js when loaded in a worker context
// directly sets up `onmessage` on `self`. So it should just work.
// The file IS the worker script — it handles messages natively.
