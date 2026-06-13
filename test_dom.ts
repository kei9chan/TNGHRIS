import fs from 'fs';

// Mock File API
class MockFile {
  name: string;
  constructor(public buffer: Buffer, name: string) {
    this.name = name;
  }
}

// Mock FileReader and Image for Node.js
// Actually, this is hard to run in Node.js because Image and document.createElement are DOM APIs!
console.log("We are in Node, so DOM APIs don't exist.");
