declare module "coordtransform" {
  const transform: {
    wgs84togcj02(lng:number,lat:number):[number,number];
    gcj02towgs84(lng:number,lat:number):[number,number];
  };
  export default transform;
}
