/*
 * Writes a .docx, with no library.
 *
 * A .docx is a ZIP holding a few XML parts. Both halves are here: a small ZIP
 * writer that stores entries uncompressed (valid, and far less code than
 * deflate), and just enough WordprocessingML for a title and a table. Word,
 * Pages and Google Docs all open the result and keep the table.
 *
 * Used by the consultant log, which has to arrive as a document in a
 * particular shape rather than as a spreadsheet.
 */
(function(){
  // ---------- bytes ----------
  var CRC_TABLE = (function(){
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++){
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();
  function crc32(bytes){
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function utf8(str){ return new TextEncoder().encode(str); }

  function Writer(){
    this.parts = [];
    this.length = 0;
  }
  Writer.prototype.push = function(bytes){ this.parts.push(bytes); this.length += bytes.length; };
  Writer.prototype.u16 = function(v){ this.push(new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF])); };
  Writer.prototype.u32 = function(v){
    this.push(new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]));
  };
  Writer.prototype.bytes = function(){
    var out = new Uint8Array(this.length), at = 0;
    this.parts.forEach(function(p){ out.set(p, at); at += p.length; });
    return out;
  };

  // MS-DOS date and time, which is what a ZIP entry carries.
  function dosTime(d){ return ((d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)) & 0xFFFF; }
  function dosDate(d){ return (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF; }

  // Files are stored, not deflated: a ZIP reader accepts either, and this way
  // there is no compressor to get wrong.
  function zip(files){
    var now = new Date(), out = new Writer(), central = [], offset = 0;
    files.forEach(function(file){
      var name = utf8(file.name), body = utf8(file.text), sum = crc32(body);
      central.push({ name: name, crc: sum, size: body.length, offset: offset });
      out.u32(0x04034b50);
      out.u16(20); out.u16(0x0800); out.u16(0);      // version, UTF-8 names, stored
      out.u16(dosTime(now)); out.u16(dosDate(now));
      out.u32(sum); out.u32(body.length); out.u32(body.length);
      out.u16(name.length); out.u16(0);
      out.push(name); out.push(body);
      offset = out.length;
    });

    var dirStart = out.length;
    central.forEach(function(entry){
      out.u32(0x02014b50);
      out.u16(20); out.u16(20); out.u16(0x0800); out.u16(0);
      out.u16(dosTime(now)); out.u16(dosDate(now));
      out.u32(entry.crc); out.u32(entry.size); out.u32(entry.size);
      out.u16(entry.name.length); out.u16(0); out.u16(0);
      out.u16(0); out.u16(0); out.u32(0);
      out.u32(entry.offset);
      out.push(entry.name);
    });

    // Measured before the end record is written, or its own bytes get counted
    // as part of the directory and the file will not open.
    var dirSize = out.length - dirStart;
    out.u32(0x06054b50);
    out.u16(0); out.u16(0);
    out.u16(central.length); out.u16(central.length);
    out.u32(dirSize); out.u32(dirStart);
    out.u16(0);
    return out.bytes();
  }

  // ---------- the document ----------
  function esc(s){
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
  // Word keeps its own line breaks; anything that looks like one in the text
  // becomes a proper break rather than a lost newline.
  function runs(text){
    return String(text == null ? '' : text).split('\n').map(function(line, i){
      return (i ? '<w:r><w:br/></w:r>' : '') + '<w:r><w:t xml:space="preserve">' + esc(line) + '</w:t></w:r>';
    }).join('');
  }
  function para(text, opts){
    var o = opts || {};
    var props = '<w:pPr>' +
      (o.spaceAfter ? '<w:spacing w:after="' + o.spaceAfter + '"/>' : '') +
      (o.bold || o.size ? '<w:rPr>' + (o.bold ? '<w:b/>' : '') + (o.size ? '<w:sz w:val="' + o.size + '"/>' : '') + '</w:rPr>' : '') +
      '</w:pPr>';
    var body = String(text == null ? '' : text).split('\n').map(function(line, i){
      return (i ? '<w:r><w:br/></w:r>' : '') +
        '<w:r>' + (o.bold || o.size ? '<w:rPr>' + (o.bold ? '<w:b/>' : '') + (o.size ? '<w:sz w:val="' + o.size + '"/>' : '') + '</w:rPr>' : '') +
        '<w:t xml:space="preserve">' + esc(line) + '</w:t></w:r>';
    }).join('');
    return '<w:p>' + props + body + '</w:p>';
  }
  function cell(text, width, bold){
    return '<w:tc><w:tcPr><w:tcW w:w="' + width + '" w:type="dxa"/></w:tcPr>' +
      para(text, { bold: bold }) + '</w:tc>';
  }
  function table(header, rows){
    var borders = '<w:tblBorders>' +
      ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function(side){
        return '<w:' + side + ' w:val="single" w:sz="6" w:space="0" w:color="999999"/>';
      }).join('') + '</w:tblBorders>';
    var head = '<w:tr>' + cell(header[0], 2600, true) + cell(header[1], 6400, true) + '</w:tr>';
    var body = rows.map(function(r){
      return '<w:tr>' + cell(r[0], 2600) + cell(r[1], 6400) + '</w:tr>';
    }).join('');
    return '<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/>' + borders + '</w:tblPr>' + head + body + '</w:tbl>';
  }

  var CONTENT_TYPES =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>';

  var RELS =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>';

  // doc: { title, subtitle, header: [left, right], rows: [[left, right]], tail: [text] }
  function build(doc){
    var body = '';
    if (doc.title) body += para(doc.title, { bold: true, size: 32, spaceAfter: 60 });
    if (doc.subtitle) body += para(doc.subtitle, { size: 20, spaceAfter: 240 });
    body += table(doc.header || ['Time and date', 'What happened'], doc.rows || []);
    (doc.tail || []).forEach(function(part){
      body += para('', { spaceAfter: 120 });
      body += para(part.text, { bold: !!part.bold, size: part.bold ? 26 : 20 });
    });

    var document =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' + body +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/>' +
      '</w:sectPr></w:body></w:document>';

    return zip([
      { name: '[Content_Types].xml', text: CONTENT_TYPES },
      { name: '_rels/.rels', text: RELS },
      { name: 'word/document.xml', text: document }
    ]);
  }

  window.CillyDocx = { build: build };
})();
