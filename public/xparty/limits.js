// Shared product limits; server-wide connection/storage budgets are separate.
export const MAX_VIDEO_BYTES=500*1024*1024;
export const MAX_CALL_SEATS=6;
export const MAX_FINITE_ROOM_CAPACITY=500;
export const ROOM_CODE_LENGTH=7;
export const validRoomCode=value=>typeof value==='string'&&/^[A-Z2-9]{7}$/.test(value);
export const normalizeRoomCode=value=>typeof value==='string'?value.trim().toUpperCase():'';
// null explicitly means the host has not set a room member limit.
export const validRoomCapacity=value=>value===null||Number.isInteger(value)&&value>=2&&value<=MAX_FINITE_ROOM_CAPACITY;
export const roomIsFull=(capacity,occupied)=>capacity!==null&&occupied>=capacity;
export const roomOccupancy=(count,capacity)=>capacity===null?`${count} · No room limit`:`${count}/${capacity}`;
