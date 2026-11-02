// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been added by NVIDIA CORPORATION & AFFILIATES.

import { css } from '@c4docs/likec4-styles/css'
import { ActionIcon, Group, Modal, Tooltip } from '@mantine/core'
import { IconMaximize, IconMinus, IconPlus, IconX } from '@tabler/icons-react'
import { useCallback, useEffect, useRef, useState } from 'react'

/** Clamp a zoom scale into a sane range. */
const MIN_SCALE = 0.2
const MAX_SCALE = 8
/** Multiplicative step applied per zoom button press. */
const ZOOM_BUTTON_STEP = 1.3
/** Sensitivity of wheel zoom; larger = faster zoom per wheel delta. */
const WHEEL_ZOOM_SENSITIVITY = 0.0015

interface Transform {
  scale: number
  x: number
  y: number
}

const INITIAL_TRANSFORM: Transform = { scale: 1, x: 0, y: 0 }

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

const viewport = css({
  position: 'relative',
  flex: '1',
  width: '[100%]',
  minHeight: '0',
  overflow: 'hidden',
  cursor: 'grab',
  touchAction: 'none',
  backgroundColor: '[var(--mantine-color-body)]',
  '&[data-panning="true"]': {
    cursor: 'grabbing',
  },
})

const stage = css({
  position: 'absolute',
  top: '0',
  left: '0',
  transformOrigin: '0 0',
  willChange: 'transform',
  // The injected mermaid <svg> should be able to grow well past the prose width.
  '& svg': {
    display: 'block',
    maxWidth: '[none]',
    height: 'auto',
  },
})

const controls = css({
  position: 'absolute',
  top: '[12px]',
  right: '[12px]',
  zIndex: '[5]',
})

export interface MermaidLightboxProps {
  /** Rendered mermaid SVG markup to display, or `null` when closed. */
  svg: string | null
  /** Accessible label describing the diagram. */
  title: string
  onClose: () => void
}

/**
 * Fullscreen lightbox for an already-rendered mermaid SVG.
 *
 * The SVG markup is the same string mermaid produced for the inline diagram, so
 * no re-render is needed. Zoom (mouse wheel, toward the cursor) and pan (drag)
 * are a self-contained CSS `transform: translate()+scale()` on a stage wrapper —
 * no pan/zoom dependency is pulled in, matching AGENTS.md guidance to prefer a
 * minimal custom transform over a new dependency.
 */
export function MermaidLightbox({ svg, title, onClose }: MermaidLightboxProps) {
  const opened = svg !== null
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  // Detaches the native wheel listener bound by the viewport callback ref.
  const detachWheelRef = useRef<(() => void) | null>(null)
  const [transform, setTransform] = useState<Transform>(INITIAL_TRANSFORM)
  const [panning, setPanning] = useState(false)
  // Drag bookkeeping kept in a ref so pointer-move handlers don't re-render.
  const dragStart = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null)
  // Whether the current pointer interaction moved past the drag threshold, so a
  // real pan isn't mistaken for a backdrop click-to-close.
  const movedRef = useRef(false)

  // Fit the diagram to the viewport: scale it up (or down) so the whole diagram
  // fills most of the screen, then center it. Mermaid SVGs are `width:100%` with
  // a `max-width` set to their natural px size, so we size the stage to that
  // natural size (from the viewBox) and derive a fit scale from the viewport.
  const fitToViewport = useCallback(() => {
    const viewport = viewportRef.current
    const stage = stageRef.current
    const svgEl = stage?.querySelector('svg')
    if (!viewport || !stage || !svgEl) {
      return
    }
    const viewBox = svgEl.viewBox.baseVal
    const naturalW = viewBox.width || svgEl.getBoundingClientRect().width || 1
    const naturalH = viewBox.height || svgEl.getBoundingClientRect().height || 1
    // Pin the stage to the diagram's natural size so `width:100%` svg resolves
    // against a real box instead of collapsing in the absolutely-positioned stage.
    stage.style.width = `${naturalW}px`
    stage.style.height = `${naturalH}px`
    const vw = viewport.clientWidth
    const vh = viewport.clientHeight
    // 0.96 leaves a small margin; cap at MAX_SCALE so tiny diagrams don't explode.
    const scale = clampScale(Math.min((vw / naturalW) * 0.96, (vh / naturalH) * 0.96, MAX_SCALE))
    setTransform({
      scale,
      x: (vw - naturalW * scale) / 2,
      y: (vh - naturalH * scale) / 2,
    })
  }, [])

  // Re-fit each time a new diagram opens. A rAF lets the SVG mount/measure first.
  useEffect(() => {
    if (!opened) {
      return
    }
    const raf = requestAnimationFrame(fitToViewport)
    return () => cancelAnimationFrame(raf)
  }, [opened, svg, fitToViewport])

  const reset = useCallback(() => fitToViewport(), [fitToViewport])

  // Zoom toward a viewport-local point (keeps that point stationary on screen).
  const zoomAt = useCallback((localX: number, localY: number, factor: number) => {
    setTransform((prev) => {
      const nextScale = clampScale(prev.scale * factor)
      const applied = nextScale / prev.scale
      return {
        scale: nextScale,
        x: localX - (localX - prev.x) * applied,
        y: localY - (localY - prev.y) * applied,
      }
    })
  }, [])

  // Callback ref for the viewport. Wheel zoom must cancel the page scroll, but
  // React binds `onWheel` passively (so `preventDefault()` is ignored). Binding
  // the listener imperatively with `{ passive: false }` the moment the node
  // mounts avoids both that and any effect-ordering race with the modal mount.
  const setViewport = useCallback((node: HTMLDivElement | null) => {
    detachWheelRef.current?.()
    detachWheelRef.current = null
    viewportRef.current = node
    if (!node) {
      return
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = node.getBoundingClientRect()
      const localX = event.clientX - rect.left
      const localY = event.clientY - rect.top
      const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY)
      zoomAt(localX, localY, factor)
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    detachWheelRef.current = () => node.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const zoomByButton = useCallback((factor: number) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) {
      return
    }
    zoomAt(rect.width / 2, rect.height / 2, factor)
  }, [zoomAt])

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    movedRef.current = false
    setPanning(true)
    setTransform((prev) => {
      dragStart.current = { pointerX: event.clientX, pointerY: event.clientY, x: prev.x, y: prev.y }
      return prev
    })
  }, [])

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current
    if (!start) {
      return
    }
    const dx = event.clientX - start.pointerX
    const dy = event.clientY - start.pointerY
    // Mark a real pan once movement passes a small threshold, so a plain click
    // on the empty backdrop still counts as a dismiss (not a 1px drag).
    if (!movedRef.current && Math.hypot(dx, dy) > 4) {
      movedRef.current = true
    }
    setTransform((prev) => ({ ...prev, x: start.x + dx, y: start.y + dy }))
  }, [])

  const endPan = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStart.current === null) {
      return
    }
    // Click on the empty backdrop (the viewport itself, not the diagram stage)
    // without dragging closes the lightbox — the fullscreen equivalent of a
    // click-outside dismiss.
    const clickedBackdrop = event.target === event.currentTarget
    const wasDrag = movedRef.current
    dragStart.current = null
    movedRef.current = false
    setPanning(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (clickedBackdrop && !wasDrag) {
      onClose()
    }
  }, [onClose])

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      fullScreen
      withCloseButton={false}
      padding={0}
      // The overlay fills the screen, so Mantine's background scroll-lock is
      // unnecessary — and its `react-remove-scroll` wrapper would otherwise
      // swallow the wheel events we need for zoom. Disable it.
      lockScroll={false}
      transitionProps={{ transition: 'fade', duration: 150 }}
      aria-label={title}
      data-testid="mermaid-lightbox"
      // fullScreen gives the content element the full viewport, but the body
      // wrapper is content-sized by default — make it a flex column that fills
      // the content so the zoom/pan viewport can take the whole screen.
      styles={{
        content: { display: 'flex', flexDirection: 'column', height: '100%' },
        body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' },
      }}>
      <Group className={controls} gap="xs">
        <Tooltip label="Zoom in" withinPortal>
          <ActionIcon variant="default" size="lg" aria-label="Zoom in" onClick={() => zoomByButton(ZOOM_BUTTON_STEP)}>
            <IconPlus size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Zoom out" withinPortal>
          <ActionIcon
            variant="default"
            size="lg"
            aria-label="Zoom out"
            onClick={() => zoomByButton(1 / ZOOM_BUTTON_STEP)}>
            <IconMinus size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Reset view" withinPortal>
          <ActionIcon variant="default" size="lg" aria-label="Reset view" onClick={reset}>
            <IconMaximize size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Close" withinPortal>
          <ActionIcon variant="default" size="lg" aria-label="Close diagram" onClick={onClose}>
            <IconX size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <div
        ref={setViewport}
        className={viewport}
        data-panning={panning}
        data-testid="mermaid-lightbox-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}>
        {svg !== null && (
          <div
            ref={stageRef}
            className={stage}
            data-testid="mermaid-lightbox-stage"
            style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}
            // svg is the same markup mermaid rendered inline; it is produced from
            // upstream-sanitized source, so injecting it here is safe.
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
      </div>
    </Modal>
  )
}
