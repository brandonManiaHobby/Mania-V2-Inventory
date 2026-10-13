// Data layer public surface. Nothing outside src/data touches Supabase.
export { SourceProvider, useSource } from './SourceProvider'
export { WAREHOUSE } from './source'
export * from './dates'
export * from './numbers'
export { saveStream, restock, returnToWarehouse, distroSale, invoiceSignedUrl, availableQty, deleteStream, editStream, reassignDepartment, addStock, editWaveCost, waveImpactSummary, deleteWave, updateProduct, loadConsumableRequests, requestConsumable, fulfilConsumableRequest, declineConsumableRequest } from './writes'
export { vatTreatmentOf, hoursOf, shortName, MONEY_LABEL, monthLabel, canonPlatform, isConsumable } from './helpers'
