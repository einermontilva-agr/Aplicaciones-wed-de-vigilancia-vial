import L from './leafletGlobal';
import { HeatLayer, HeatLayerOptions, HeatLatLng } from 'leaflet.heat';

export interface CapaCalorLeaflet extends L.Layer {
  setLatLngs(latlngs: HeatLatLng[]): this;
  addLatLng(latlng: HeatLatLng): this;
  setOptions(options: HeatLayerOptions): this;
  redraw(): this;
}

export function crearCapaCalor(
  latlngs: HeatLatLng[],
  options?: HeatLayerOptions
): CapaCalorLeaflet {
  return new HeatLayer(latlngs, options as never) as unknown as CapaCalorLeaflet;
}

export { HeatLayer };
export default L;
