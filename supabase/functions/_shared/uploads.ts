import { Database, HttpError, rpc, text, uuid } from "./http.ts";
export function validImage(bytes: Uint8Array, mime: string) {
  if(mime === "image/jpeg") return bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
  if(mime === "image/png") return [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
  if(mime === "image/webp") return new TextDecoder().decode(bytes.slice(0,4))==="RIFF" && new TextDecoder().decode(bytes.slice(8,12))==="WEBP";
  return false;
}
export async function vehicleUpload(db:Database,authId:string,action:string,input:Record<string,unknown>) {
  if(action === "upload_prepare") {
    if(!Number.isInteger(input.size) || Number(input.size)<1 || Number(input.size)>10485760) throw new HttpError(400,"invalid_input");
    const ticket=await rpc(db,"website_vehicle_upload",{p_auth_id:authId,p_action:"reserve",p_input:{slug:text(input.slug,300),filename:text(input.filename,200),mime:text(input.mime,30),size:input.size}});
    const {data,error}=await db.storage.from("website-uploads").createSignedUploadUrl(ticket.path);
    if(error) throw new HttpError(503,"service_unavailable");
    return {...ticket,token:data.token};
  }
  const id=uuid(input.id);
  const ticket=await rpc(db,"website_vehicle_upload",{p_auth_id:authId,p_action:"read",p_input:{id}});
  if(ticket.image_id) return {image_id:ticket.image_id};
  const {data:file,error}=await db.storage.from("website-uploads").download(ticket.path);
  if(error || !file || file.size!==ticket.size || file.size>10485760) throw new HttpError(422,"invalid_input");
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(!validImage(bytes,ticket.mime)) throw new HttpError(422,"invalid_input");
  const destination=`${ticket.id}.${({"image/jpeg":"jpg","image/png":"png","image/webp":"webp"} as Record<string,string>)[ticket.mime]}`;
  const uploaded=await db.storage.from("website-vehicle-images").upload(destination,bytes,{contentType:ticket.mime,upsert:true,cacheControl:"31536000"});
  if(uploaded.error) throw new HttpError(503,"service_unavailable");
  const {data:{publicUrl}}=db.storage.from("website-vehicle-images").getPublicUrl(destination);
  const result=await rpc(db,"website_vehicle_upload",{p_auth_id:authId,p_action:"complete",p_input:{id,url:publicUrl}});
  await db.storage.from("website-uploads").remove([ticket.path]);
  return result;
}
