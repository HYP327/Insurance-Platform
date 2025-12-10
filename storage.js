const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const chalk = require('chalk');

class StorageManager {
  constructor(basePath = './storage') {
    this.basePath = basePath;
    this.chunkSize = 1024 * 1024; // 1MB chunks
  }

  // Create necessary directories
  async initialize() {
    await fs.mkdir(path.join(this.basePath, 'chunks'), { recursive: true });
    await fs.mkdir(path.join(this.basePath, 'metadata'), { recursive: true });
    await fs.mkdir(path.join(this.basePath, 'temp'), { recursive: true });
    console.log(chalk.green('Storage system initialized'));
  }

  // Split file into chunks
  async splitFile(filePath, filename) {
    try {
      const fileBuffer = await fs.readFile(filePath);
      const fileSize = fileBuffer.length;
      const chunks = [];
      const chunkCount = Math.ceil(fileSize / this.chunkSize);

      console.log(chalk.cyan(`Splitting ${filename} into ${chunkCount} chunks...`));

      for (let i = 0; i < chunkCount; i++) {
        const start = i * this.chunkSize;
        const end = Math.min(start + this.chunkSize, fileSize);
        const chunkData = fileBuffer.slice(start, end);
        
        // Generate chunk ID
        const chunkHash = crypto.createHash('md5').update(chunkData).digest('hex');
        const chunkId = `${filename}_chunk_${i}_${chunkHash}`;
        const chunkPath = path.join(this.basePath, 'chunks', chunkId);

        // Save chunk
        await fs.writeFile(chunkPath, chunkData);

        chunks.push({
          index: i,
          id: chunkId,
          size: chunkData.length,
          hash: chunkHash,
          path: chunkPath
        });

        console.log(chalk.yellow(`Created chunk ${i + 1}/${chunkCount}`));
      }

      // Save metadata
      const metadata = {
        filename,
        originalSize: fileSize,
        chunkSize: this.chunkSize,
        chunkCount,
        chunks: chunks.map(c => ({
          index: c.index,
          id: c.id,
          size: c.size,
          hash: c.hash
        })),
        createdAt: new Date().toISOString(),
        reassembled: false
      };

      const metadataPath = path.join(this.basePath, 'metadata', `${filename}.json`);
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

      console.log(chalk.green(`File ${filename} split into ${chunkCount} chunks`));
      return metadata;

    } catch (error) {
      console.error(chalk.red(`Error splitting file: ${error.message}`));
      throw error;
    }
  }

  // Reassemble file from chunks
  async reassembleFile(filename, outputPath) {
    try {
      const metadataPath = path.join(this.basePath, 'metadata', `${filename}.json`);
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));

      console.log(chalk.cyan(`Reassembling ${filename} from ${metadata.chunkCount} chunks...`));

      // Create buffer for final file
      const fileBuffer = Buffer.alloc(metadata.originalSize);
      let bytesWritten = 0;

      // Read and assemble chunks in order
      for (const chunkInfo of metadata.chunks.sort((a, b) => a.index - b.index)) {
        const chunkPath = path.join(this.basePath, 'chunks', chunkInfo.id);
        const chunkData = await fs.readFile(chunkPath);
        
        // Verify chunk integrity
        const chunkHash = crypto.createHash('md5').update(chunkData).digest('hex');
        if (chunkHash !== chunkInfo.hash) {
          throw new Error(`Chunk ${chunkInfo.index} integrity check failed`);
        }

        // Write chunk to buffer
        chunkData.copy(fileBuffer, bytesWritten);
        bytesWritten += chunkData.length;

        console.log(chalk.yellow(`Added chunk ${chunkInfo.index + 1}/${metadata.chunkCount}`));
      }

      // Write final file
      await fs.writeFile(outputPath, fileBuffer);

      // Update metadata
      metadata.reassembled = true;
      metadata.reassembledAt = new Date().toISOString();
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

      console.log(chalk.green(`File reassembled successfully: ${outputPath}`));
      return outputPath;

    } catch (error) {
      console.error(chalk.red(`Error reassembling file: ${error.message}`));
      throw error;
    }
  }

  // Get storage usage statistics
  async getStorageStats() {
    try {
      const chunksPath = path.join(this.basePath, 'chunks');
      const metadataPath = path.join(this.basePath, 'metadata');
      
      let totalSize = 0;
      let chunkCount = 0;
      let fileCount = 0;

      // Calculate chunk storage
      try {
        const chunkFiles = await fs.readdir(chunksPath);
        chunkCount = chunkFiles.length;
        
        for (const file of chunkFiles) {
          const stats = await fs.stat(path.join(chunksPath, file));
          totalSize += stats.size;
        }
      } catch (error) {
        // Directory might not exist yet
      }

      // Count metadata files
      try {
        const metaFiles = await fs.readdir(metadataPath);
        fileCount = metaFiles.length;
      } catch (error) {
        // Directory might not exist yet
      }

      return {
        totalSize,
        chunkCount,
        fileCount,
        formatted: {
          totalSize: this.formatBytes(totalSize),
          averageChunkSize: this.formatBytes(totalSize / Math.max(chunkCount, 1))
        }
      };
    } catch (error) {
      console.error(chalk.red(`Error getting storage stats: ${error.message}`));
      return { totalSize: 0, chunkCount: 0, fileCount: 0 };
    }
  }

  // Clean up orphaned chunks
  async cleanup() {
    try {
      const chunksPath = path.join(this.basePath, 'chunks');
      const metadataPath = path.join(this.basePath, 'metadata');
      
      // Get all metadata files
      const metaFiles = await fs.readdir(metadataPath);
      const usedChunks = new Set();

      // Collect all chunk IDs from metadata
      for (const metaFile of metaFiles) {
        const metadata = JSON.parse(await fs.readFile(path.join(metadataPath, metaFile), 'utf8'));
        metadata.chunks.forEach(chunk => usedChunks.add(chunk.id));
      }

      // Get all chunks on disk
      const allChunks = await fs.readdir(chunksPath);
      let deletedCount = 0;

      // Delete orphaned chunks
      for (const chunkFile of allChunks) {
        if (!usedChunks.has(chunkFile)) {
          await fs.unlink(path.join(chunksPath, chunkFile));
          deletedCount++;
          console.log(chalk.yellow(`Deleted orphaned chunk: ${chunkFile}`));
        }
      }

      console.log(chalk.green(`Cleanup completed. Deleted ${deletedCount} orphaned chunks.`));
      return deletedCount;

    } catch (error) {
      console.error(chalk.red(`Cleanup error: ${error.message}`));
      return 0;
    }
  }

  // Helper: Format bytes to human readable
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = { StorageManager };