import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import { PendingTransaction, AnyTransaction } from '@helium/http'
import { differenceBy, unionBy } from 'lodash'
import { initFetchers, txnFetchers } from '../../utils/appDataClient'
import { FilterType } from '../../features/wallet/root/walletTypes'

export type Loading = 'idle' | 'pending' | 'fulfilled' | 'rejected'
export type ActivityViewState =
  | 'init'
  | 'reset'
  | 'no_activity'
  | 'has_activity'

export type ActivityState = {
  txns: {
    all: { data: AnyTransaction[]; status: Loading }
    hotspot: { data: AnyTransaction[]; status: Loading }
    mining: { data: AnyTransaction[]; status: Loading }
    payment: { data: AnyTransaction[]; status: Loading }
    pending: { data: PendingTransaction[]; status: Loading }
  }
  filter: FilterType
  detailTxn?: AnyTransaction | PendingTransaction
  requestMore: boolean
  activityViewState: ActivityViewState
}

const initialState: ActivityState = {
  txns: {
    all: { data: [], status: 'idle' },
    hotspot: { data: [], status: 'idle' },
    mining: { data: [], status: 'idle' },
    payment: { data: [], status: 'idle' },
    pending: { data: [], status: 'idle' },
  },
  filter: 'all',
  requestMore: false,
  activityViewState: 'init',
}

export const ACTIVITY_FETCH_SIZE = 50

type FetchTxns = { filter: FilterType; reset?: boolean }
export const fetchTxns = createAsyncThunk<
  AnyTransaction[] | PendingTransaction[],
  FetchTxns
>('activity/fetchAccountActivity', async ({ filter, reset }, { dispatch }) => {
  if (reset) {
    await initFetchers()
    dispatch(activitySlice.actions.resetTxnStatuses(filter))
  }

  const list = txnFetchers[filter]
  return list.takeJSON(filter === 'pending' ? 1000 : ACTIVITY_FETCH_SIZE)
})

const activitySlice = createSlice({
  name: 'activity',
  initialState,
  reducers: {
    setFilter: (state, action: PayloadAction<FilterType>) => {
      state.filter = action.payload
    },
    requestMoreActivity: (state) => {
      state.requestMore = true
    },
    resetTxnStatuses: (state, action: PayloadAction<FilterType>) => {
      if (state.activityViewState !== 'init') {
        state.activityViewState = 'reset'
      }
      Object.keys(state.txns).forEach((key) => {
        const filterType = key as FilterType
        if (filterType !== 'pending' && filterType !== action.payload) {
          // Don't reset pending, it updates on an interval, and we clear it manually
          // Don't reset the requested filter type. We want that one to stay pending
          state.txns[filterType].status = 'idle'
        }
      })
    },
    addPendingTransaction: (
      state,
      action: PayloadAction<PendingTransaction>,
    ) => {
      state.txns.pending.data.push(action.payload)
    },
    setDetailTxn: (
      state,
      action: PayloadAction<AnyTransaction | PendingTransaction>,
    ) => {
      state.detailTxn = action.payload
    },
    clearDetailTxn: (state) => {
      return { ...state, detailTxn: undefined }
    },
    signOut: () => {
      return { ...initialState }
    },
  },
  extraReducers: (builder) => {
    builder.addCase(
      fetchTxns.pending,
      (
        state,
        {
          meta: {
            arg: { filter },
          },
        },
      ) => {
        state.txns[filter].status = 'pending'
      },
    )
    builder.addCase(
      fetchTxns.rejected,
      (
        state,
        {
          meta: {
            arg: { filter },
          },
        },
      ) => {
        state.requestMore = false
        state.txns[filter].status = 'rejected'
      },
    )
    builder.addCase(
      fetchTxns.fulfilled,
      (
        state,
        {
          payload,
          meta: {
            arg: { filter, reset },
          },
        },
      ) => {
        state.requestMore = false
        state.txns[filter].status = 'fulfilled'

        if (reset && state.filter === filter) {
          Object.keys(state.txns).forEach((key) => {
            const filterType = key as FilterType
            if (filterType !== 'pending') {
              // Don't reset pending, we will clear it manually
              state.txns[filterType].data = []
            }
          })
        }

        if (payload.length === 0) return

        if (filter === 'pending') {
          const pending = payload as PendingTransaction[]
          const filtered = pending.filter((txn) => txn.status === 'pending')
          const joined = unionBy(filtered, state.txns.pending.data, 'hash')
          state.txns.pending.data = joined
        } else {
          const nextTxns = [
            ...state.txns[filter].data,
            ...(payload as AnyTransaction[]),
          ]
          state.txns[filter].data = nextTxns

          // remove any pending txns with the same hash
          const nextPending = differenceBy(
            state.txns.pending.data,
            nextTxns,
            'hash',
          )
          state.txns.pending.data = nextPending

          // Determine if the user has any activity data
          let hasData = false
          Object.keys(state.txns).every((key) => {
            const filterType = key as FilterType
            const { data } = state.txns[filterType]
            if (data.length > 0) {
              hasData = true
            }
            return !hasData
          })
          state.activityViewState = hasData ? 'has_activity' : 'no_activity'
        }
      },
    )
  },
})

export default activitySlice
