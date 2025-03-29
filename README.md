# Social Media Parser

A Node.js tool for parsing posts from Facebook and Instagram, extracting media content and post information.

## Features

- Parses posts from Facebook and Instagram
- Downloads images and videos
- Extracts post metadata (likes, comments, shares)
- Supports multiple languages
- Handles both single and multiple media posts
- Merges video and audio streams

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- ffmpeg (for video processing)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/social-media-parser.git
cd social-media-parser
```

2. Install dependencies:
```bash
npm install
```

3. Install ffmpeg (if not already installed):
- On macOS: `brew install ffmpeg`
- On Ubuntu: `sudo apt-get install ffmpeg`
- On Windows: Download from [ffmpeg website](https://ffmpeg.org/download.html)

## Usage

1. Prepare an Excel file with URLs to parse (column name should be "URL")

2. Run the parser:
```bash
node src/index.js path/to/your/excel/file.xlsx
```

## Output

The parser will create:
- `media/` directory containing downloaded media files
- `downloads/` directory for temporary files
- Processed data will be available in the specified output format

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. 