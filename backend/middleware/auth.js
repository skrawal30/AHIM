const jwt=require("jsonwebtoken");
function requireAdmin(req,res,next){
 const h=String(req.headers.authorization||"");
 const token=h.startsWith("Bearer ")?h.slice(7).trim():null;
 if(!token)return res.status(401).json({success:false,message:"Login required."});
 if(!process.env.JWT_SECRET)return res.status(500).json({success:false,message:"JWT_SECRET is not configured."});
 try{req.admin=jwt.verify(token,process.env.JWT_SECRET);next();}
 catch{res.status(401).json({success:false,message:"Session expired. Please log in again."});}
}
module.exports={requireAdmin};