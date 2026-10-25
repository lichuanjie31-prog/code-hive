import { createContext, useContext } from 'react'

export const MemberContext = createContext(null)
export function useMember() { return useContext(MemberContext) }
export const statusNames = { pending: '待审核', approved: '已批准', rejected: '已拒绝', suspended: '已暂停' }
