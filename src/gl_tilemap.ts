import { ExtensionType, GlProgram, Shader, WebGLRenderer } from 'pixi.js';
import { settings } from './settings';
import { Tilemap } from './Tilemap';
import { TilemapAdaptor, TilemapPipe } from './TilemapPipe';
import { TileTextureArray } from './TileTextureArray';

const gl_tilemap_vertex = `#version 100
precision highp float;
attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;
attribute vec4 aFrame;
attribute vec2 aAnim;
attribute float aAnimDivisor;
attribute float aTextureId;
attribute float aAlpha;

uniform mat3 proj_trans_matrix;
uniform vec2 anim_frame;

varying vec2 vTextureCoord;
varying float vTextureId;
varying vec4 vFrame;
varying float vAlpha;

void main(void)
{
  gl_Position = vec4((proj_trans_matrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
  vec2 animCount = floor((aAnim + 0.5) / 2048.0);
  vec2 animFrameOffset = aAnim - animCount * 2048.0;
  vec2 currentFrame = floor(anim_frame / aAnimDivisor);
  vec2 loop_num = floor((currentFrame + 0.5) / animCount);
  vec2 animOffset = animFrameOffset * floor(currentFrame - loop_num * animCount);

  vTextureCoord = aTextureCoord + animOffset;
  vFrame = aFrame + vec4(animOffset, animOffset);
  vTextureId = aTextureId;
  vAlpha = aAlpha;
}
`;

const gl_tilemap_fragment = `#version 100
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vTextureCoord;
varying vec4 vFrame;
varying float vTextureId;
varying float vAlpha;

//include_textures

void main(void)
{
  float textureId = floor(vTextureId + 0.5);
  vec2 textureCoord = clamp(vTextureCoord, vFrame.xy, vFrame.zw);
  vec4 color = sampleMultiTexture(textureId, textureCoord * u_texture_size[textureId].zw);
  gl_FragColor = color * vAlpha;
}
`;

export class GlTilemapAdaptor extends TilemapAdaptor
{
    public static extension = {
        type: [
            ExtensionType.WebGLPipesAdaptor,
        ],
        name: 'tilemap',
    } as const;

    _shader: Shader = null;
    max_textures: number = settings.TEXTURES_PER_TILEMAP;

    destroy(): void
    {
        this._shader.destroy(true);
        this._shader = null;
    }

    execute(pipe: TilemapPipe, tilemap: Tilemap): void
    {
        const renderer = pipe.renderer as WebGLRenderer;
        const shader = this._shader;
        const tileset = tilemap.getTileset();

        shader.resources.u_texture_size = tileset.tex_sizes;

        for (let i = 0; i < tileset.length; i++)
        {
            renderer.texture.bind(tileset.arr[i], i);
        }

        renderer.encoder.draw({
            geometry: tilemap.vb,
            shader,
            state: tilemap.state,
        });

        // TODO: support several tilemaps here, without re-setting extra uniforms
    }

    init(): void
    {
        this._shader = new Shader({
            glProgram: GlProgram.from({
                vertex: gl_tilemap_vertex,
                fragment: gl_tilemap_fragment.replace('//include_textures',
                    TileTextureArray.generate_gl_textures(this.max_textures))
            }),
            resources: {
                ...TileTextureArray.gl_gen_resources(this.max_textures),
                pipe_uniforms: this.pipe_uniforms,
            },
        });
    }
}