import { StatusBar, Style } from '@capacitor/status-bar';
import { Device } from '@capacitor/device';

export class StatusBarService {
  private static instance: StatusBarService;
  private isCapacitor: boolean = false;

  private constructor() {
    this.checkPlatform();
  }

  public static getInstance(): StatusBarService {
    if (!StatusBarService.instance) {
      StatusBarService.instance = new StatusBarService();
    }
    return StatusBarService.instance;
  }

  private async checkPlatform() {
    const info = await Device.getInfo();
    this.isCapacitor = info.platform !== 'web';
  }

  async initialize() {
    try {
      if (this.isCapacitor) {
        // Make status bar overlay the WebView
        await StatusBar.setOverlaysWebView({ overlay: true });
        
        // Set status bar to be transparent
        await StatusBar.setBackgroundColor({ color: '#00000000' });
        
        // Automatically adjust status bar text color based on background
        await StatusBar.setStyle({ style: Style.Default });
      }
    } catch (err) {
      console.error('Error initializing StatusBar', err);
    }
  }

  async setStatusBarStyleDark() {
    try {
      if (this.isCapacitor) {
        await StatusBar.setStyle({ style: Style.Dark });
      }
    } catch (err) {
      console.error('Error setting dark style', err);
    }
  }

  async setStatusBarStyleLight() {
    try {
      if (this.isCapacitor) {
        await StatusBar.setStyle({ style: Style.Light });
      }
    } catch (err) {
      console.error('Error setting light style', err);
    }
  }

  async hideStatusBar() {
    try {
      if (this.isCapacitor) {
        await StatusBar.hide();
      }
    } catch (err) {
      console.error('Error hiding status bar', err);
    }
  }

  async showStatusBar() {
    try {
      if (this.isCapacitor) {
        await StatusBar.show();
      }
    } catch (err) {
      console.error('Error showing status bar', err);
    }
  }
} 