import { describe, expect, it } from '@jest/globals';

import { buildFcpXml } from '../../tools/fcp-xml-builder.js';

describe('buildFcpXml()', () => {
  it('builds an FCP XML timeline with transitions, encoded paths, and zoom keyframes', () => {
    const sequenceName = '\u0058\u004d\u004c\u6d4b\u8bd5\u5e8f\u5217';
    const firstStillPath = 'E:/\u4f5c\u4e1a 1/\u955c\u5934 01.jpg';
    const secondStillPath = 'E:/\u4f5c\u4e1a 1/\u955c\u5934 02.jpg';
    const audioPath = 'E:/\u4f5c\u4e1a 1/\u97f3\u4e50 bed.wav';
    const xml = buildFcpXml({
      sequenceName,
      frameRate: 30,
      frameWidth: 1080,
      frameHeight: 1920,
      transitionDurationSec: 0.5,
      clips: [
        {
          path: firstStillPath,
          name: '\u955c\u5934 01.jpg',
          durationSec: 5,
          sourceWidth: 2160,
          sourceHeight: 3840,
          zoomFrom: 50,
          zoomTo: 57.5,
          centerFrom: [540, 960],
          centerTo: [560, 940],
          rotationFrom: -3,
          rotationTo: 1,
        },
        {
          path: secondStillPath,
          name: '\u955c\u5934 02.jpg',
          durationSec: 5,
          sourceWidth: 2160,
          sourceHeight: 3840,
          zoomFrom: 54,
          zoomTo: 50,
        },
      ],
      audioPath,
    });

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<xmeml version="4">');
    expect(xml).toContain(`<name>${sequenceName}</name>`);
    expect(xml).toContain('<width>1080</width>');
    expect(xml).toContain('<height>1920</height>');
    expect(xml).toContain('<pathurl>file://localhost/E%3A/%E4%BD%9C%E4%B8%9A%201/%E9%95%9C%E5%A4%B4%2001.jpg</pathurl>');
    expect(xml).toContain('<duration>86400</duration>');
    expect(xml).toContain('<keyframe><when>0</when><value>50</value></keyframe>');
    expect(xml).toContain('<keyframe><when>150</when><value>57.5</value></keyframe>');
    expect(xml).toContain('<parameterid>center</parameterid>');
    expect(xml).toContain('<name>Center</name>');
    expect(xml).toContain('<horiz>540</horiz><vert>960</vert>');
    expect(xml).toContain('<horiz>560</horiz><vert>940</vert>');
    expect(xml).toContain('<parameterid>rotation</parameterid>');
    expect(xml).toContain('<name>Rotation</name>');
    expect(xml).toContain('<keyframe><when>0</when><value>-3</value></keyframe>');
    expect(xml).toContain('<keyframe><when>150</when><value>1</value></keyframe>');
    expect(xml).toContain('<start>143</start>');
    expect(xml).toContain('<end>158</end>');
    expect(xml).toContain('<name>Cross Dissolve</name>');
    expect(xml).toContain('<pathurl>file://localhost/E%3A/%E4%BD%9C%E4%B8%9A%201/%E9%9F%B3%E4%B9%90%20bed.wav</pathurl>');
  });

  it('omits optional motion and audio sections when they are not requested', () => {
    const xml = buildFcpXml({
      sequenceName: 'Simple Sequence',
      frameWidth: 1920,
      frameHeight: 1080,
      clips: [
        {
          path: 'E:/media/clip.mp4',
          name: 'clip.mp4',
          durationSec: 2,
          sourceWidth: 3840,
          sourceHeight: 2160,
          scalePercent: 50,
        },
      ],
      transitionDurationSec: 0,
    });

    expect(xml).toContain('<value>50</value>');
    expect(xml).not.toContain('<keyframe>');
    expect(xml).not.toContain('<transitionitem>');
    expect(xml).not.toContain('<audio>');
    expect(xml).toContain('<duration>60</duration>');
    expect(xml).toContain('<pathurl>file://localhost/E%3A/media/clip.mp4</pathurl>');
  });
});
