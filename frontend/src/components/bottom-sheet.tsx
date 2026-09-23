import { Box, Flex } from '@chakra-ui/react'
import { type ReactNode, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ButtonBox } from './primitives'

/** 下へのスワイプで閉じるしきい値（モックと同じ 60px） */
const CLOSE_DISTANCE = 60

const focusable = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
]

/** Tab のループに入れるもの（つまみ＝閉じる も含める。閉じる操作に到達できるべき） */
const focusableSelector = focusable.join(',')

/**
 * 開いたときにフォーカスを移す「最初の操作」を探すもの（§4.0.3）。
 * つまみ（閉じる）は操作ではないので外す。見つからなければシート自身へ移す。
 */
const firstFocusableSelector = focusable.map((s) => `${s}:not([data-sheet-grip])`).join(',')

export type BottomSheetProps = {
  open: boolean
  /** 読み上げ名（§4.0.3 の表。画面IDではなくシートごとの名前） */
  label: string
  /** 閉じる（下へのスワイプ・背景のタップ・つまみ・Esc）。何も保存しない */
  onClose: () => void
  children: ReactNode
  /** 下端に固定する主ボタンなど */
  footer?: ReactNode
  /** 高いシート（S-12・S-14・S-15・S-21・S-32）は 100dvh 近くまで使ってよい */
  tall?: boolean
  /**
   * 端末のキーボードを使うシート（S-12・S-14 のメモ、S-32・S-33・S-34）。
   * visualViewport に合わせて位置と最大の高さを変える（§4.0.3）
   */
  adjustForKeyboard?: boolean
  /** 開いたときにフォーカスを移す要素（S-21 は入力先の欄、S-04 はいま見ている月のマス） */
  initialFocusRef?: React.RefObject<HTMLElement | null>
}

/**
 * ボトムシート（§4.0.3・§7.5）。
 * ・下から出る（220ms）。reduced-motion では動かさない
 * ・閉じるのは 下へのスワイプ／背景のタップ／つまみ／Esc。見た目の［閉じる］ボタンは置かない
 * ・つまみは見た目を変えずに「閉じる」の読み上げ名を持つ button
 * ・開く前にフォーカスしていた要素を覚え、閉じたら戻す
 * ・シートの上にシートを重ねない（中身を切り替える）
 */
export function BottomSheet({
  open,
  label,
  onClose,
  children,
  footer,
  tall,
  adjustForKeyboard,
  initialFocusRef,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const [dragY, setDragY] = useState(0)
  const dragStart = useRef<number | null>(null)
  const [keyboardInset, setKeyboardInset] = useState(0)

  // 開く前にフォーカスしていた要素を覚え、シートの最初の操作へ移す。閉じたら戻す（§4.0.3）
  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const sheet = sheetRef.current
    const target = initialFocusRef?.current ?? sheet?.querySelector<HTMLElement>(firstFocusableSelector) ?? sheet
    target?.focus()
    return () => {
      restoreRef.current?.focus()
    }
  }, [open, initialFocusRef])

  // 外付けキーボードの Esc で閉じる。Tab はシートの中で回す
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const sheet = sheetRef.current
      if (!sheet) return
      const items = Array.from(sheet.querySelectorAll<HTMLElement>(focusableSelector))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  // 開いているあいだは後ろのページとタブバーを `inert` にする。
  // タップ・フォーカス・読み上げがまとめて止まるので、Tab のループと二重に守れる（§4.0.3）
  useEffect(() => {
    if (!open) return
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-app-page],[data-app-tabbar]'))
    // 開く前の状態を覚えて、閉じたら戻す（シートを続けて開いても壊れない）
    const had = nodes.map((node) => node.hasAttribute('inert'))
    for (const node of nodes) node.setAttribute('inert', '')
    return () => {
      nodes.forEach((node, index) => {
        if (!had[index]) node.removeAttribute('inert')
      })
    }
  }, [open])

  // 端末のキーボードに合わせて位置と最大の高さを変える（§4.0.3）
  useEffect(() => {
    if (!open || !adjustForKeyboard) return
    const viewport = window.visualViewport
    if (!viewport) return
    const update = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      setKeyboardInset(inset)
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      setKeyboardInset(0)
    }
  }, [open, adjustForKeyboard])

  if (!open) return null

  const onGripDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    dragStart.current = event.clientY
    // 端末によっては使えない（無くてもよい）
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const onGripMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragStart.current == null) return
    setDragY(Math.max(0, event.clientY - dragStart.current))
  }
  const onGripUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragStart.current == null) return
    const moved = event.clientY - dragStart.current
    dragStart.current = null
    setDragY(0)
    if (moved > CLOSE_DISTANCE) onClose()
  }

  const maxH = keyboardInset > 0 ? `calc(100dvh - ${keyboardInset}px - 8px)` : undefined

  return createPortal(
    <>
      {/* 背景幕。タップで閉じる（何も保存しない） */}
      <Box
        position='fixed'
        inset='0'
        zIndex='overlay'
        bg='backdrop'
        animation='backdropIn {durations.base} {easings.out}'
        onClick={onClose}
      />
      <Flex
        ref={sheetRef}
        role='dialog'
        aria-modal='true'
        aria-label={label}
        tabIndex={-1}
        position='fixed'
        left='0'
        right='0'
        bottom={keyboardInset > 0 ? `${keyboardInset}px` : '0'}
        zIndex='sheet'
        flexDirection='column'
        maxH={maxH ?? (tall ? 'var(--sheet-tall-max-h)' : 'var(--sheet-max-h)')}
        bg='bg.surface'
        borderTopRadius='sheet'
        boxShadow='sheet'
        pl='var(--pad-l)'
        pr='var(--pad-r)'
        pb='calc(16px + var(--sa-bottom))'
        overflowY='auto'
        overscrollBehavior='contain'
        animation='sheetUp {durations.base} {easings.out}'
        transform={dragY > 0 ? `translateY(${dragY}px)` : undefined}
        _focus={{ outline: 'none' }}
      >
        {/* つまみ: 見た目は 36×4px の棒だけ。読み上げ名は「閉じる」 */}
        <ButtonBox
          type='button'
          aria-label='閉じる'
          data-sheet-grip
          onClick={onClose}
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripUp}
          flex='none'
          w='100%'
          h='20px'
          display='grid'
          placeItems='center'
          touchAction='none'
          borderRadius='control'
          _before={{
            content: '""',
            w: '36px',
            h: '4px',
            borderRadius: '2px',
            bg: 'border.strong',
          }}
        />
        <Flex direction='column' flex='1' minH='0' w='100%' maxW='contentMax' mx='auto'>
          {children}
          {footer ? (
            <Box position='sticky' bottom='0' bg='bg.surface' pt={2}>
              {footer}
            </Box>
          ) : null}
        </Flex>
      </Flex>
    </>,
    document.body
  )
}

export type SheetTitleProps = { children: ReactNode; trailing?: ReactNode }

/** シートの見出しの行（18px bold。右にその場の1行や補助の操作を置く） */
export function SheetHeader({ children, trailing }: SheetTitleProps) {
  return (
    <Flex alignItems='center' justifyContent='space-between' gap={2} minH='tapMin'>
      <Box fontSize='xl' fontWeight='bold' lineHeight='tight'>
        {children}
      </Box>
      {trailing}
    </Flex>
  )
}
