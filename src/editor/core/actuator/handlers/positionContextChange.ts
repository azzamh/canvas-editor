import { IPositionContextChangePayload } from '../../../interface/Listener'
import { Draw } from '../../draw/Draw'

export function positionContextChange(
  draw: Draw,
  payload: IPositionContextChangePayload
) {
  const { value, oldValue } = payload
  // Remove table tool
  if (oldValue.isTable && !value.isTable) {
    draw.getTableTool().dispose()
  }
}
