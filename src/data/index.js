// Data layer public surface. Nothing outside src/data touches Supabase.
export { SourceProvider, useSource } from './SourceProvider'
export { WAREHOUSE } from './source'
export * from './dates'
export * from './numbers'
export { saveStream } from './writes'
