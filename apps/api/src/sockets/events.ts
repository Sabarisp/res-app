// ---------------------------------------------------------------------------
// Socket.IO events and their receivers (Phase 2).
// Rooms: kitchen, waiters, admin, table:<tableId>, order:<orderId>.
// Staff rooms require a valid staff login; customers may only join their own
// order:<id> / table:<id> rooms by presenting the table qrToken (sockets/index.ts).
//
// | event                      | receivers                                        |
// |----------------------------|--------------------------------------------------|
// | order:new                  | kitchen, waiters, admin, order:<id>, table:<id>  |
// | order:status_changed       | kitchen, waiters, admin, order:<id>, table:<id>  |
// | item:status_changed        | kitchen, waiters, order:<id>, table:<id>         |
// | waiter:called              | waiters, table:<id>                              |
// | bill:requested             | waiters, admin, table:<id>                       |
// | menu:availability_changed  | broadcast (all connected clients)                |
// | inventory:low_stock        | admin                                            |
// ---------------------------------------------------------------------------

export const SOCKET_EVENTS = {
  orderNew: 'order:new',
  orderStatusChanged: 'order:status_changed',
  itemStatusChanged: 'item:status_changed',
  waiterCalled: 'waiter:called',
  billRequested: 'bill:requested',
  menuAvailabilityChanged: 'menu:availability_changed',
  inventoryLowStock: 'inventory:low_stock',
} as const;
