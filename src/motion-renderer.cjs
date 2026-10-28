(function(root) {
  'use strict';
  class MotionRenderer {
    constructor(tracks, fields) {
      this.canvas = document.createElement('canvas');
      const gl = this.gl = this.canvas.getContext('webgl2', { alpha:true, premultipliedAlpha:true, antialias:false, depth:false, stencil:false, preserveDrawingBuffer:true, powerPreference:'low-power' });
      if (!gl) throw new Error('WebGL2 unavailable');
      this.lost = false;
      this.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; });
      const shader = (type, code) => {
        const s = gl.createShader(type); gl.shaderSource(s, code); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const program = this.program = gl.createProgram();
      gl.attachShader(program, shader(gl.VERTEX_SHADER, `#version 300 es
        in vec2 position; out vec2 uv;
        void main(){ gl_Position=vec4(position,0.,1.); uv=vec2(position.x*.5+.5,.5-position.y*.5); }`));
      gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `#version 300 es
        precision highp float;
        in vec2 uv; out vec4 color;
        uniform sampler2D firstPose; uniform sampler2D secondPose; uniform sampler2D vectors;
        uniform float phase;
        vec4 pixel(sampler2D image, vec2 p) {
          if(any(lessThan(p,vec2(0.))) || any(greaterThan(p,vec2(1.)))) return vec4(0.);
          vec4 c=texture(image,p); return c;
        }
        void main(){
          vec2 a=uv, b=uv;
          // Inverse-map both images towards the same intermediate silhouette.
          for(int i=0;i<3;i++){
            a=uv-phase*texture(vectors,clamp(a,0.,1.)).xy;
            b=uv-(1.-phase)*texture(vectors,clamp(b,0.,1.)).zw;
          }
          color=mix(pixel(firstPose,a),pixel(secondPose,b),smoothstep(.30,.70,phase));
        }`));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      this.quadVAO = gl.createVertexArray(); gl.bindVertexArray(this.quadVAO);
      const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(program,'position'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
      for (const [i,name] of ['firstPose','secondPose','vectors'].entries()) gl.uniform1i(gl.getUniformLocation(program,name),i);
      this.phase = gl.getUniformLocation(program,'phase');
      const texture = () => {
        const tex=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,tex);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        return tex;
      };
      this.tracks = {};
      for(const [name,frames] of Object.entries(tracks)) {
        const bytes = fields[name];
        if (!bytes || bytes.byteLength !== 128*192*8*8) throw new Error('Invalid motion field: '+name);
        const packed = new Uint16Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/2);
        this.tracks[name] = frames.map((frame,index)=>{
          const pose = texture(); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
          gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,frame);
          const flow = texture();
          gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,128,192,0,gl.RGBA,gl.HALF_FLOAT,packed.subarray(index*128*192*4,(index+1)*128*192*4));
          return {pose,flow};
        });
      }
      if(gl.getError()!==gl.NO_ERROR) throw new Error('Motion textures could not be uploaded');
    }
    draw(track,frame,next,phase,width,height) {
      if(this.lost) return null;
      const gl=this.gl, pair=this.tracks[track];
      if(this.canvas.width!==width || this.canvas.height!==height) { this.canvas.width=width; this.canvas.height=height; gl.viewport(0,0,width,height); }
      gl.useProgram(this.program); gl.bindVertexArray(this.quadVAO);
      for(const [i,tex] of [pair[frame].pose,pair[next].pose,pair[frame].flow].entries()) { gl.activeTexture(gl.TEXTURE0+i); gl.bindTexture(gl.TEXTURE_2D,tex); }
      gl.uniform1f(this.phase,phase);gl.drawArrays(gl.TRIANGLES,0,6);
      return this.canvas;
    }
  }
  root.PetMotionRenderer = MotionRenderer;
})(window);
