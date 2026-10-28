// Patched copy of @sabaki/shudan's Vertex component (src/Vertex.js).
//
// Shudan collapses every positive paint value to the single class
// `shudan-paint_1`:
//
//     [`shudan-paint_${paint > 0 ? 1 : -1}`]: !!paint
//
// so a painted vertex can only ever be "black" or "white". Sabaki's SGF DD
// support needs a colour, which it passes through the numeric paint value
// (1 = the theme's default dim, 2..7 = the LINE_COLORS palette). The additions
// here are the import paths (this copy lives in src/, not inside the package)
// and the `shudan-paint_color_*` class below. Everything else mirrors Shudan
// 1.8.0, including the paint-opacity and corner-merging maths.
import {createElement as h} from 'preact'
import {useCallback} from 'preact/hooks'
import classnames from 'classnames'

import {avg, vertexEvents, signEquals} from '@sabaki/shudan/src/helper.js'
import Marker from '@sabaki/shudan/src/Marker.js'

import {dimPaintColorName} from '@sabaki-app/modules/dim.js'

const absoluteStyle = (zIndex) => ({
  position: 'absolute',
  zIndex,
})

export default function Vertex(props) {
  let {
    position,
    shift,
    random,
    sign,
    heat,
    paint,
    paintLeft,
    paintRight,
    paintTop,
    paintBottom,
    paintTopLeft,
    paintTopRight,
    paintBottomLeft,
    paintBottomRight,
    dimmed,
    marker,
    ghostStone,
    animate,
    selected,
    selectedLeft,
    selectedRight,
    selectedTop,
    selectedBottom,
  } = props

  let eventHandlers = {}

  for (let eventName of vertexEvents) {
    eventHandlers[eventName] = useCallback(
      (evt) => {
        props[`on${eventName}`]?.(evt, position)
      },
      [...position, props[`on${eventName}`]],
    )
  }

  let markerMarkup = (zIndex) =>
    !!marker &&
    h(Marker, {
      key: 'marker',
      sign,
      type: marker.type,
      label: marker.label,
      zIndex,
    })

  return h(
    'div',
    Object.assign(
      {
        'data-x': position[0],
        'data-y': position[1],

        title: marker?.tooltip ?? marker?.label,
        style: {
          position: 'relative',
        },
        className: classnames(
          'shudan-vertex',
          `shudan-random_${random}`,
          `shudan-sign_${sign}`,
          {
            [`shudan-shift_${shift}`]: !!shift,
            [`shudan-heat_${!!heat && heat.strength}`]: !!heat,
            'shudan-dimmed': dimmed,
            'shudan-animate': animate,

            [`shudan-paint_${paint > 0 ? 1 : -1}`]: !!paint,
            [`shudan-paint_color_${dimPaintColorName(paint)}`]:
              dimPaintColorName(paint) != null,
            'shudan-paintedleft': !!paint && signEquals(paintLeft, paint),
            'shudan-paintedright': !!paint && signEquals(paintRight, paint),
            'shudan-paintedtop': !!paint && signEquals(paintTop, paint),
            'shudan-paintedbottom': !!paint && signEquals(paintBottom, paint),

            'shudan-selected': selected,
            'shudan-selectedleft': selectedLeft,
            'shudan-selectedright': selectedRight,
            'shudan-selectedtop': selectedTop,
            'shudan-selectedbottom': selectedBottom,

            [`shudan-marker_${marker?.type}`]: !!marker?.type,
            'shudan-smalllabel':
              marker?.type === 'label' &&
              (marker.label?.includes('\n') || marker.label.length >= 3),

            [`shudan-ghost_${ghostStone?.sign}`]: !!ghostStone,
            [`shudan-ghost_${ghostStone?.type}`]: !!ghostStone?.type,
            'shudan-ghost_faint': !!ghostStone?.faint,
          },
        ),
      },
      ...vertexEvents.map((eventName) => ({
        [`on${eventName}`]: eventHandlers[eventName],
      })),
    ),

    !sign && markerMarkup(0),
    !sign &&
      !!ghostStone &&
      h('div', {
        key: 'ghost',
        className: 'shudan-ghost',
        style: absoluteStyle(1),
      }),

    h(
      'div',
      {key: 'stone', className: 'shudan-stone', style: absoluteStyle(2)},

      !!sign &&
        h(
          'div',
          {
            key: 'inner',
            className: classnames(
              'shudan-inner',
              'shudan-stone-image',
              `shudan-random_${random}`,
              `shudan-sign_${sign}`,
            ),
            style: absoluteStyle(),
          },
          sign,
        ),

      !!sign && markerMarkup(),
    ),

    (!!paint || !!paintLeft || !!paintRight || !!paintTop || !!paintBottom) &&
      h('div', {
        key: 'paint',
        className: 'shudan-paint',
        style: {
          ...absoluteStyle(3),
          '--shudan-paint-opacity': avg(
            (!!paint
              ? [paint]
              : [paintLeft, paintRight, paintTop, paintBottom].map(
                  (x) => x !== 0 && !isNaN(x),
                )
            ).map((x) => Math.abs(x ?? 0) * 0.5),
          ),
          '--shudan-paint-box-shadow': [
            signEquals(paintLeft, paintTop, paintTopLeft)
              ? [Math.sign(paintTop), '-.5em -.5em']
              : null,
            signEquals(paintRight, paintTop, paintTopRight)
              ? [Math.sign(paintTop), '.5em -.5em']
              : null,
            signEquals(paintLeft, paintBottom, paintBottomLeft)
              ? [Math.sign(paintBottom), '-.5em .5em']
              : null,
            signEquals(paintRight, paintBottom, paintBottomRight)
              ? [Math.sign(paintBottom), '.5em .5em']
              : null,
          ]
            .filter((x) => !!x && x[0] !== 0)
            .map(
              ([sign, translation]) =>
                `${translation} 0 0 var(${
                  sign > 0
                    ? '--shudan-black-background-color'
                    : '--shudan-white-background-color'
                })`,
            )
            .join(','),
        },
      }),

    !!selected &&
      h('div', {
        key: 'selection',
        className: 'shudan-selection',
        style: absoluteStyle(4),
      }),

    h('div', {
      key: 'heat',
      className: 'shudan-heat',
      style: absoluteStyle(5),
    }),
    heat?.text != null &&
      h(
        'div',
        {
          key: 'heatlabel',
          className: 'shudan-heatlabel',
          style: absoluteStyle(6),
        },
        heat.text && heat.text.toString(),
      ),
  )
}
