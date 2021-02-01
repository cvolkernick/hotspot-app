/* eslint-disable @typescript-eslint/naming-convention */
import React, {
  useRef,
  forwardRef,
  useImperativeHandle,
  Ref,
  useEffect,
  useState,
  useCallback,
  memo,
} from 'react'
import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet'
import Animated from 'react-native-reanimated'
import { useSelector } from 'react-redux'
import { useAsync } from 'react-async-hook'
import { LayoutAnimation } from 'react-native'
import {
  AnyTransaction,
  AddGatewayV1,
  PendingTransaction,
  AssertLocationV1,
} from '@helium/http'
import animalName from 'angry-purple-tiger'
import ActivityItem from './ActivityItem'
import { WalletAnimationPoints } from '../walletLayout'
import ActivityCardHeader from './ActivityCardHeader'
import { RootState } from '../../../../store/rootReducer'
import { getSecureItem } from '../../../../utils/secureAccount'
import { isPendingTransaction } from '../../../../utils/transactions'
import { FilterType } from '../walletTypes'
import { fetchTxns } from '../../../../store/account/accountSlice'
import { useAppDispatch } from '../../../../store/store'
import { useSpacing } from '../../../../theme/themeHooks'
import usePrevious from '../../../../utils/usePrevious'
import useActivityItem from '../useActivityItem'
import { useWalletContext } from '../ActivityDetails/WalletProvider'
import ActivityCardLoading from './ActivityCardLoading'

type Props = {
  animationPoints: WalletAnimationPoints
  animatedIndex?: Animated.Value<number>
  onChange?: (index: number) => void
}

const ActivityCard = forwardRef((props: Props, ref: Ref<BottomSheet>) => {
  const { animationPoints, animatedIndex, onChange } = props
  const [transactionData, setTransactionData] = useState<
    (AnyTransaction | PendingTransaction)[]
  >([])
  const { setActivityItem } = useWalletContext()
  const [filter, setFilter] = useState<FilterType>('all')
  const prevFilter = usePrevious(filter)
  const { result: address } = useAsync(getSecureItem, ['address'])
  const { backgroundColor, title, listIcon, amount, time } = useActivityItem(
    address || '',
  )
  const { m } = useSpacing()
  const dispatch = useAppDispatch()
  const {
    account: { txns },
  } = useSelector((state: RootState) => state)
  const prevStatus = usePrevious(txns[filter].status)

  useEffect(() => {
    dispatch(fetchTxns(filter))
    dispatch(fetchTxns('pending'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (prevFilter !== filter) {
      dispatch(fetchTxns(filter))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevFilter, filter])

  useEffect(() => {
    let data: (PendingTransaction | AnyTransaction)[]
    data = txns[filter].data
    if (filter === 'all') {
      data = [...txns.pending.data, ...data]
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setTransactionData(data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txns[filter]])

  // type BottomSheetHandle = ElementRef<typeof BottomSheet>
  const sheet = useRef<BottomSheet>(null)

  // TODO is there an easier way to copy/forward these methods?
  useImperativeHandle(ref, () => ({
    snapTo(index: number, force?: boolean): void {
      sheet.current?.snapTo(index, force)
    },
    expand() {
      sheet.current?.expand()
    },
    collapse() {
      sheet.current?.collapse()
    },
    close() {
      sheet.current?.close()
    },
  }))

  const handleActivityItemPressed = useCallback(
    (item: AnyTransaction | PendingTransaction) => () => {
      setActivityItem(item)
    },
    [setActivityItem],
  )

  type Item = {
    item: AnyTransaction | PendingTransaction
    index: number
  }

  const getSubtitle = useCallback(
    (item: AnyTransaction | PendingTransaction) => {
      if (item instanceof AssertLocationV1 || item instanceof AddGatewayV1) {
        return animalName(item.gateway)
      }
      return amount(item)
    },
    [amount],
  )

  const renderItem = useCallback(
    ({ item, index }: Item) => {
      return (
        <ActivityItem
          hash={item.hash}
          handlePress={handleActivityItemPressed(item)}
          isFirst={index === 0}
          isLast={!!transactionData && index === transactionData.length - 1}
          backgroundColor={backgroundColor(item)}
          icon={listIcon(item)}
          title={title(item)}
          subtitle={getSubtitle(item)}
          time={time(item)}
        />
      )
    },
    [
      backgroundColor,
      getSubtitle,
      handleActivityItemPressed,
      listIcon,
      time,
      title,
      transactionData,
    ],
  )

  const { dragMax, dragMid, dragMin } = animationPoints

  // TODO
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const onFilterChanged = useCallback((f: FilterType) => {
    setTransactionData([])
    setFilter(f)
  }, [])

  return (
    <BottomSheet
      handleComponent={ActivityCardHeader}
      snapPoints={[dragMin, dragMid, dragMax]}
      index={1}
      animateOnMount={false}
      ref={sheet}
      onChange={onChange}
      animatedIndex={animatedIndex}
    >
      <BottomSheetFlatList
        data={transactionData}
        renderItem={renderItem}
        keyExtractor={(item: AnyTransaction | PendingTransaction) => {
          if (isPendingTransaction(item)) {
            return `${filter}.${(item as PendingTransaction).hash}`
          }

          return `${filter}.${(item as AddGatewayV1).hash}`
        }}
        contentContainerStyle={{ paddingHorizontal: m }}
        maxToRenderPerBatch={30}
        initialNumToRender={30}
        ListFooterComponent={
          <ActivityCardLoading
            isLoading={
              txns[filter].status === 'pending' && !transactionData?.length
            }
            hasNoResults={
              txns[filter].status === 'fulfilled' &&
              transactionData &&
              transactionData.length === 0 &&
              prevStatus === 'fulfilled' &&
              prevFilter === filter
            }
          />
        }
        onEndReached={() => dispatch(fetchTxns(filter))}
      />
    </BottomSheet>
  )
})

export default memo(ActivityCard)