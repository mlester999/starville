import Phaser from 'phaser';

export class FoundationScene extends Phaser.Scene {
  public constructor() {
    super({ key: 'foundation' });
  }

  public create(): void {
    const { centerX, centerY } = this.cameras.main;

    this.add
      .text(centerX, centerY, 'STARVILLE\nRUNTIME FOUNDATION', {
        align: 'center',
        color: '#f7f4e8',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '22px',
        fontStyle: 'bold',
        letterSpacing: 2,
        lineSpacing: 8,
      })
      .setOrigin(0.5);
  }
}
