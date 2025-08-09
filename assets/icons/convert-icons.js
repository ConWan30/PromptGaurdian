/**
 * High-Grade Icon Converter for PromptGuardian
 * Converts SVG icons to high-quality PNG with proper anti-aliasing
 */

const fs = require('fs');
const path = require('path');

// Simple SVG to Canvas conversion for high-quality PNG generation
function convertSVGtoPNG(svgContent, size) {
    // For browser-based conversion, we'll create an HTML file that can be opened
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Icon Converter</title>
    <style>
        body { margin: 0; padding: 20px; background: #f0f0f0; }
        #container { text-align: center; }
        canvas { border: 2px solid #333; margin: 10px; }
        .download-btn { 
            background: linear-gradient(135deg, #00D2FF, #3A7BD5);
            color: white; 
            border: none; 
            padding: 10px 20px; 
            border-radius: 8px; 
            cursor: pointer;
            font-weight: bold;
            margin: 5px;
        }
        .download-btn:hover { opacity: 0.9; }
    </style>
</head>
<body>
    <div id="container">
        <h2>PromptGuardian High-Grade Icons</h2>
        <div id="canvases"></div>
        <button class="download-btn" onclick="downloadAll()">Download All PNG Icons</button>
    </div>

    <script>
        const sizes = [16, 32, 48, 128];
        const svgData = {
            16: \`${fs.readFileSync(path.join(__dirname, 'icon-16.svg'), 'utf8')}\`,
            32: \`${fs.readFileSync(path.join(__dirname, 'icon-32.svg'), 'utf8')}\`,
            48: \`${fs.readFileSync(path.join(__dirname, 'icon-48.svg'), 'utf8')}\`,
            128: \`${fs.readFileSync(path.join(__dirname, 'icon-128.svg'), 'utf8')}\`
        };

        function createCanvas(size) {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            canvas.id = \`canvas-\${size}\`;
            
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            const img = new Image();
            const svgBlob = new Blob([svgData[size]], {type: 'image/svg+xml;charset=utf-8'});
            const url = URL.createObjectURL(svgBlob);
            
            img.onload = function() {
                ctx.clearRect(0, 0, size, size);
                ctx.drawImage(img, 0, 0, size, size);
                URL.revokeObjectURL(url);
                
                // Add download button for this size
                const btn = document.createElement('button');
                btn.className = 'download-btn';
                btn.textContent = \`Download \${size}x\${size} PNG\`;
                btn.onclick = () => downloadPNG(size);
                document.getElementById('canvases').appendChild(btn);
            };
            
            img.src = url;
            return canvas;
        }

        function downloadPNG(size) {
            const canvas = document.getElementById(\`canvas-\${size}\`);
            const link = document.createElement('a');
            link.download = \`icon-\${size}.png\`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        }

        function downloadAll() {
            sizes.forEach((size, index) => {
                setTimeout(() => downloadPNG(size), index * 500);
            });
        }

        // Initialize canvases
        window.onload = function() {
            const container = document.getElementById('canvases');
            sizes.forEach(size => {
                const canvas = createCanvas(size);
                const div = document.createElement('div');
                div.appendChild(document.createTextNode(\`\${size}x\${size}:\`));
                div.appendChild(document.createElement('br'));
                div.appendChild(canvas);
                container.appendChild(div);
            });
        };
    </script>
</body>
</html>`;

    return htmlContent;
}

// Generate the conversion HTML file
const htmlContent = convertSVGtoPNG();
fs.writeFileSync(path.join(__dirname, 'icon-converter.html'), htmlContent);

console.log('🎨 High-Grade Icon Converter Created!');
console.log('');
console.log('📋 Instructions:');
console.log('1. Open: assets/icons/icon-converter.html in Microsoft Edge');
console.log('2. Click "Download All PNG Icons" button');
console.log('3. Save the PNG files to the same directory');
console.log('4. Extension icons will be ready for loading!');
console.log('');
console.log('✨ Features:');
console.log('• Premium gradient shields with metallic finish');
console.log('• Advanced AI neural network visualization');
console.log('• Holographic scan lines and particle effects');
console.log('• Professional glow and shadow effects');
console.log('• High-quality anti-aliasing for crisp edges');