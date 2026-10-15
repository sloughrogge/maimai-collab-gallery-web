"use client";
import {useEffect,useRef} from "react";
import type * as L from "leaflet";
import type {Point,RouteResult} from "../lib/gallery";
type Pin={id:string;name:string;point:Point;selected:boolean;number:number};
export default function RouteMap({origin,pins,route,picking,onPick,onStore}:{origin:Point|null;pins:Pin[];route:RouteResult|null;picking:"origin"|"store"|null;onPick:(point:Point)=>void;onStore:(id:string)=>void}){
  const el=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),layer=useRef<L.LayerGroup|null>(null),api=useRef<typeof L|null>(null);
  const handlers=useRef({picking,onPick,onStore});handlers.current={picking,onPick,onStore};
  useEffect(()=>{let cancelled=false;void import("leaflet").then(L=>{if(cancelled||!el.current)return;api.current=L;
    const m=L.map(el.current,{zoomControl:true,scrollWheelZoom:false}).setView([31.2304,121.4737],13);map.current=m;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',referrerPolicy:"strict-origin-when-cross-origin"}).addTo(m);
    layer.current=L.layerGroup().addTo(m);
    m.on("click",e=>{if(handlers.current.picking)handlers.current.onPick({lat:e.latlng.lat,lng:e.latlng.lng});});
    m.on("focus",()=>m.scrollWheelZoom.enable());m.on("blur",()=>m.scrollWheelZoom.disable());
    const resize=new ResizeObserver(()=>m.invalidateSize());resize.observe(el.current);(m as L.Map&{_cleanup?:()=>void})._cleanup=()=>resize.disconnect();
    draw();
  });return()=>{cancelled=true;if(map.current){(map.current as L.Map&{_cleanup?:()=>void})._cleanup?.();map.current.remove();}map.current=null;};},[]);
  const latest=useRef({origin,pins,route});latest.current={origin,pins,route};
  function draw(){const L=api.current,m=map.current,group=layer.current;if(!L||!m||!group)return;group.clearLayers();const {origin,pins,route}=latest.current;const bounds:L.LatLngExpression[]=[];
    if(origin){L.circleMarker([origin.lat,origin.lng],{radius:8,color:"#fff",weight:3,fillColor:"#207a67",fillOpacity:1}).bindTooltip("出发地").addTo(group);bounds.push([origin.lat,origin.lng]);}
    pins.forEach(pin=>{const icon=L.divIcon({className:"map-pin-wrap",html:`<span class="map-pin ${pin.selected?"selected":""}">${pin.number}</span>`,iconSize:[34,42],iconAnchor:[17,42]});
      const marker=L.marker([pin.point.lat,pin.point.lng],{icon,keyboard:true,title:pin.name}).addTo(group);const label=document.createElement("span");label.textContent=pin.name;marker.bindTooltip(label);marker.on("click",()=>handlers.current.onStore(pin.id));bounds.push([pin.point.lat,pin.point.lng]);});
    if(route){const points=route.coordinates.map(([lng,lat])=>[lat,lng] as [number,number]);L.polyline(points,{color:"#d83e32",weight:5,opacity:.9}).addTo(group);bounds.push(...points);}
    if(bounds.length>1)m.fitBounds(L.latLngBounds(bounds),{padding:[35,35],maxZoom:16});else if(bounds.length===1)m.setView(bounds[0],15);
  }
  useEffect(draw,[origin,pins,route]);
  return <div className={`map-shell ${picking?"is-picking":""}`}><div ref={el} className="map-canvas" aria-label="门店与道路路线地图"/>{picking&&<div className="pick-hint">点击地图，设置{picking==="origin"?"出发地":"选中门店的位置"}</div>}<a className="fix-map" href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">完善地图</a></div>;
}
