module PIXI.tilemap {

    export class RectTileLayer extends PIXI.Container {
        constructor(zIndex: number, texture: PIXI.Texture | Array<PIXI.Texture>) {
            super();
            this.initialize(zIndex, texture);
        }

        textures: Array<Texture>;
        z = 0;
        zIndex = 0;
        pointsBuf : Array<number> = [];
        _tempSize = new Float32Array([0, 0]);
        _tempTexSize = 1;
        modificationMarker = 0;
        hasAnim = false;

        initialize(zIndex : number, textures: PIXI.Texture | Array<PIXI.Texture>) {
            if (!textures) {
                textures = [];
            } else if (!(textures instanceof Array) && (textures as PIXI.Texture).baseTexture) {
                textures = [textures as PIXI.Texture];
            }
            this.textures = textures as Array<PIXI.Texture>;
            this.z = this.zIndex = zIndex;
            this.visible = false;
        }

        clear() {
            this.pointsBuf.length = 0;
            this.modificationMarker = 0;
            this.hasAnim = false;
        }

        renderCanvas(renderer: CanvasRenderer) {
            if (this.textures.length === 0) return;
            var points = this.pointsBuf;
            renderer.context.fillStyle = '#000000';
            for (var i = 0, n = points.length; i < n; i += 9) {
                var x1 = points[i], y1 = points[i + 1];
                var x2 = points[i + 2], y2 = points[i + 3];
                var w = points[i + 4];
                var h = points[i + 5];
                x1 += points[i + 6] * renderer.plugins.tilemap.tileAnim[0];
                y1 += points[i + 7] * renderer.plugins.tilemap.tileAnim[1];
                var textureId = points[i + 8];
                if (textureId >= 0) {
                    renderer.context.drawImage(this.textures[textureId].baseTexture.source, x1, y1, w, h, x2, y2, w, h);
                } else {
                    renderer.context.globalAlpha = 0.5;
                    renderer.context.fillRect(x2, y2, w, h);
                    renderer.context.globalAlpha = 1;
                }
            }
        }

        addRect(textureId: number, u: number, v: number, x: number, y: number, tileWidth: number, tileHeight: number, animX: number = 0, animY: number = 0) {
            var pb = this.pointsBuf;
            this.hasAnim = this.hasAnim || animX > 0 || animY > 0;
            if (tileWidth == tileHeight) {
                pb.push(u);
                pb.push(v);
                pb.push(x);
                pb.push(y);
                pb.push(tileWidth);
                pb.push(tileHeight);
                pb.push(animX | 0);
                pb.push(animY | 0);
                pb.push(textureId);
            } else {
                var i: number;
                if (tileWidth % tileHeight === 0) {
                    //horizontal line on squares
                    for (i = 0; i < tileWidth / tileHeight; i++) {
                        pb.push(u + i * tileHeight);
                        pb.push(v);
                        pb.push(x + i * tileHeight);
                        pb.push(y);
                        pb.push(tileHeight);
                        pb.push(tileHeight);
                        pb.push(animX | 0);
                        pb.push(animY | 0);
                        pb.push(textureId);
                    }
                } else if (tileHeight % tileWidth === 0) {
                    //vertical line on squares
                    for (i = 0; i < tileHeight / tileWidth; i++) {
                        pb.push(u);
                        pb.push(v + i * tileWidth);
                        pb.push(x);
                        pb.push(y + i * tileWidth);
                        pb.push(tileWidth);
                        pb.push(tileWidth);
                        pb.push(animX | 0);
                        pb.push(animY | 0);
                        pb.push(textureId);
                    }
                } else {
                    //ok, ok, lets use rectangle. but its not working with square shader yet
                    pb.push(u);
                    pb.push(v);
                    pb.push(x);
                    pb.push(y);
                    pb.push(tileWidth);
                    pb.push(tileHeight);
                    pb.push(animX | 0);
                    pb.push(animY | 0);
                    pb.push(textureId);
                }
            }
        };

        vbId = 0;
        vbBuffer : ArrayBuffer = null;
        vbArray : Float32Array = null;
        vbInts : Uint32Array = null;

        renderWebGL(renderer: WebGLRenderer, useSquare: boolean = false) {
            var points = this.pointsBuf;
            if (points.length === 0) return;
            var rectsCount = points.length / 9;
            var tile = renderer.plugins.tilemap;
            var gl = renderer.gl;
            if (!useSquare) {
                tile.checkIndexBuffer(rectsCount);
            }

            var shader = tile.getShader(useSquare);
            var textures = this.textures;
            if (textures.length === 0) return;
            var len = textures.length;
            if (this._tempTexSize < shader.maxTextures) {
                this._tempTexSize = shader.maxTextures;
                this._tempSize = new Float32Array(2 * shader.maxTextures);
            }
            // var samplerSize = this._tempSize;
            for (var i = 0; i < len; i++) {
                if (!textures[i] || !textures[i].valid) return;
                var texture = textures[i].baseTexture;
                // samplerSize[i * 2] = 1.0 / texture.width;
                // samplerSize[i * 2 + 1] = 1.0 / texture.height;
            }
            tile.bindTextures(renderer, shader, textures);
            // shader.uniforms.uSamplerSize = samplerSize;
            //lost context! recover!
            var vb = tile.getVb(this.vbId);
            if (!vb) {
                vb = tile.createVb(useSquare);
                this.vbId = vb.id;
                this.vbBuffer = null;
                this.modificationMarker = 0;
            }
            var vao = vb.vao;
            renderer.bindVao(vao);
            var vertexBuf = vb.vb as glCore.GLBuffer;
            //if layer was changed, re-upload vertices
            vertexBuf.bind();
            var vertices = rectsCount * shader.vertPerQuad;
            if (vertices === 0) return;
            if (this.modificationMarker != vertices) {
                this.modificationMarker = vertices;
                var vs = shader.stride * vertices;
                if (!this.vbBuffer || this.vbBuffer.byteLength < vs) {
                    //!@#$ happens, need resize
                    var bk = shader.stride;
                    while (bk < vs) {
                        bk *= 2;
                    }
                    this.vbBuffer = new ArrayBuffer(bk);
                    this.vbArray = new Float32Array(this.vbBuffer);
                    this.vbInts = new Uint32Array(this.vbBuffer);
                    vertexBuf.upload(this.vbBuffer, 0, true);
                }

                var arr = this.vbArray, ints = this.vbInts;
                //upload vertices!
                var sz = 0;
                //var tint = 0xffffffff;
                var textureId: number, shiftU: number, shiftV: number;
                if (useSquare) {
                    for (i = 0; i < points.length; i += 9) {
                        textureId = (points[i + 8] >> 2);
                        shiftU = 1024 * (points[i + 8] & 1);
                        shiftV = 1024 * ((points[i + 8] >> 1) & 1);
                        arr[sz++] = points[i + 2];
                        arr[sz++] = points[i + 3];
                        arr[sz++] = points[i + 0] + shiftU;
                        arr[sz++] = points[i + 1] + shiftV;
                        arr[sz++] = points[i + 4];
                        arr[sz++] = points[i + 6];
                        arr[sz++] = points[i + 7];
                        arr[sz++] = textureId;
                    }
                } else {
                    //var tint = 0xffffffff;
                    var tint = -1;
                    for (i = 0; i < points.length; i += 9) {
                        var eps = 0.5;
                        textureId = (points[i + 8] >> 2);
                        shiftU = 1024 * (points[i + 8] & 1);
                        shiftV = 1024 * ((points[i + 8] >> 1) & 1);
                        var x = points[i + 2], y = points[i + 3];
                        var w = points[i + 4], h = points[i + 5];
                        var u = points[i] + shiftU, v = points[i + 1] + shiftV;
                        var animX = points[i + 6], animY = points[i + 7];
                        arr[sz++] = x;
                        arr[sz++] = y;
                        arr[sz++] = u;
                        arr[sz++] = v;
                        arr[sz++] = u + eps;
                        arr[sz++] = v + eps;
                        arr[sz++] = u + w - eps;
                        arr[sz++] = v + h - eps;
                        arr[sz++] = animX;
                        arr[sz++] = animY;
                        arr[sz++] = textureId;
                        arr[sz++] = x + w;
                        arr[sz++] = y;
                        arr[sz++] = u + w;
                        arr[sz++] = v;
                        arr[sz++] = u + eps;
                        arr[sz++] = v + eps;
                        arr[sz++] = u + w - eps;
                        arr[sz++] = v + h - eps;
                        arr[sz++] = animX;
                        arr[sz++] = animY;
                        arr[sz++] = textureId;
                        arr[sz++] = x + w;
                        arr[sz++] = y + h;
                        arr[sz++] = u + w;
                        arr[sz++] = v + h;
                        arr[sz++] = u + eps;
                        arr[sz++] = v + eps;
                        arr[sz++] = u + w - eps;
                        arr[sz++] = v + h - eps;
                        arr[sz++] = animX;
                        arr[sz++] = animY;
                        arr[sz++] = textureId;
                        arr[sz++] = x;
                        arr[sz++] = y + h;
                        arr[sz++] = u;
                        arr[sz++] = v + h;
                        arr[sz++] = u + eps;
                        arr[sz++] = v + eps;
                        arr[sz++] = u + w - eps;
                        arr[sz++] = v + h - eps;
                        arr[sz++] = animX;
                        arr[sz++] = animY;
                        arr[sz++] = textureId;
                    }
                }
                // if (vs > this.vbArray.length/2 ) {
                vertexBuf.upload(arr, 0, true);
                // } else {
                //     var view = arr.subarray(0, vs);
                //     vb.upload(view, 0);
                // }
            }
            if (useSquare)
                gl.drawArrays(gl.POINTS, 0, vertices);
            else
                gl.drawElements(gl.TRIANGLES, rectsCount * 6, gl.UNSIGNED_SHORT, 0);
        }
    }

}