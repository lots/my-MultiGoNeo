import {h, Component} from 'preact'
import classNames from 'classnames'

import i18n from '../../i18n.js'
import {noop} from '../../modules/helper.js'
import {LINE_COLORS, normalizeLineColor} from '../../modules/linecolor.js'
import Bar from './Bar.js'

const t = i18n.context('EditBar')

const colorNames = {
  black: () => t('Black'),
  white: () => t('White'),
  red: () => t('Red'),
  yellow: () => t('Yellow'),
  blue: () => t('Blue'),
  green: () => t('Green'),
}

class EditBar extends Component {
  constructor() {
    super()

    this.state = {
      stoneTool: 1,
    }

    this.handleToolButtonClick = this.handleToolButtonClick.bind(this)
    this.handleColorButtonClick = this.handleColorButtonClick.bind(this)
  }

  componentWillReceiveProps({selectedTool}) {
    if (selectedTool === this.props.selectedTool) return

    if (selectedTool.indexOf('stone') === 0) {
      this.setState({stoneTool: +selectedTool.replace('stone_', '')})
    }
  }

  shouldComponentUpdate(nextProps) {
    return nextProps.mode !== this.props.mode || nextProps.mode === 'edit'
  }

  handleToolButtonClick(evt) {
    let {selectedTool, onToolButtonClick = noop} = this.props

    evt.tool = evt.currentTarget.dataset.id

    if (
      evt.tool.indexOf('stone') === 0 &&
      selectedTool.indexOf('stone') === 0
    ) {
      evt.tool = `stone_${-this.state.stoneTool}`
      this.setState(({stoneTool}) => ({stoneTool: -stoneTool}))
    }

    onToolButtonClick(evt)
  }

  handleColorButtonClick(evt) {
    let {
      selectedTool,
      lineColor,
      dimColor,
      onLineColorButtonClick = noop,
      onDimColorButtonClick = noop,
    } = this.props

    let color = normalizeLineColor(evt.currentTarget.dataset.color)
    let isDim = selectedTool === 'dim'
    let current = normalizeLineColor(isDim ? dimColor : lineColor)

    // Clicking the active colour again goes back to the theme's default.
    let change = {color: current === color ? null : color}

    if (isDim) onDimColorButtonClick(change)
    else onLineColorButtonClick(change)
  }

  renderButton(title, toolId, selected = false) {
    return h(
      'li',
      {class: classNames({selected})},
      h(
        'a',
        {
          title,
          href: '#',
          'data-id': toolId,
          onClick: this.handleToolButtonClick,
        },

        h('img', {src: `./img/edit/${toolId}.svg`}),
      ),
    )
  }

  // `color == null` is the "theme default" entry: the mark is drawn with the
  // theme's own foreground colour and carries no colour in the SGF.
  renderColorButton(color, selected) {
    let isDefault = color == null

    return h(
      'li',
      {class: classNames('line-color', {selected})},
      h(
        'a',
        {
          title: isDefault ? t('Theme colour') : colorNames[color](),
          href: '#',
          'data-color': isDefault ? '' : color,
          onClick: this.handleColorButtonClick,
        },

        h('span', {
          class: `line-color-swatch line-color-swatch-${isDefault ? 'default' : color}`,
        }),
      ),
    )
  }

  render({selectedTool, lineColor, dimColor}, {stoneTool}) {
    let isSelected = ([, id]) =>
      id.replace(/_-?1$/, '') === selectedTool.replace(/_-?1$/, '')

    let buttons = [
      [t('Stone Tool'), `stone_${stoneTool}`],
      [t('Cross Tool'), 'cross'],
      [t('Triangle Tool'), 'triangle'],
      [t('Square Tool'), 'square'],
      [t('Circle Tool'), 'circle'],
      [t('Line Tool'), 'line'],
      [t('Arrow Tool'), 'arrow'],
      [t('Dim Tool'), 'dim'],
      [t('Label Tool'), 'label'],
      [t('Number Tool'), 'number'],
    ].map((x) => this.renderButton(...x, isSelected(x)))

    // The colour row applies to the three tools that paint one: line, arrow and
    // dim (each with its own remembered colour).
    let isDim = selectedTool === 'dim'
    let showColors = isDim || ['line', 'arrow'].includes(selectedTool)
    let activeColor = normalizeLineColor(isDim ? dimColor : lineColor)

    if (showColors) {
      buttons.push(h('li', {class: 'line-color-separator'}))
      buttons.push(
        this.renderColorButton(null, activeColor == null),
        ...LINE_COLORS.map((color) =>
          this.renderColorButton(color, activeColor === color),
        ),
      )
    }

    return h(
      Bar,
      Object.assign({type: 'edit'}, this.props),
      h('ul', {}, buttons),
    )
  }
}

export default EditBar
