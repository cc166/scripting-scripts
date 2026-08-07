// File: app_intents.tsx - 最终兼容版 (解决 ReferenceError: Can't find variable: Widget)

declare const Storage: { 
  get<T>(key: string): T | undefined; 
  set(key: string, value: any): void;
};

// 🚀 最终修复：明确从 "scripting" 导入 Widget，保证 Intent 运行时找到变量。
import { AppIntentManager, AppIntentProtocol, Widget } from "scripting";
import { extractPickupFromText } from "./pickup_parser";

// 常量（从 const.ts 嵌入）
export const cardIndexKey = "card.index";
export const countKey = "count";

// 定义类型接口
interface PickedItem {
  code: string;
  timestamp: number;
}
interface PickupConfig {
  pickedItems: PickedItem[];
  importedMessages: string[];
}

const PICKUP_CONFIG_KEY = "smsPickup_widget_config_v1";

// --- 其他 Intent ---

export const SetCardIndexIntent = AppIntentManager.register({
  name: "SetCarIndexIntent",
  protocol: AppIntentProtocol.AppIntent,
  perform: async (
    index: number
  ) => {
    Storage.set(cardIndexKey, index);
    Widget.reloadAll();
  }
});

export const IncreaseCountIntent = AppIntentManager.register({
  name: "IncreaseCountIntent",
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_: void) => {
    const count = Storage.get<number>(countKey) ?? 0;
    Storage.set(countKey, count + 1);
    Widget.reloadAll();
  }
});


// --- 快递码交互 Intent ---

// 🚀 Intent 3: 标记/取消标记单个包裹 (点击 1 -> 灰色，点击 2 -> 消失)
export const TogglePickedIntent = AppIntentManager.register({
  name: "TogglePickedIntent",
  protocol: AppIntentProtocol.AppIntent,
  perform: async (
    code: string 
  ) => {
    const storedCfg = Storage.get<PickupConfig>(PICKUP_CONFIG_KEY);
    const config: PickupConfig = storedCfg || { pickedItems: [], importedMessages: [] }; 
    let pickedItems = Array.isArray(config.pickedItems) ? config.pickedItems : [];
    
    const now = Date.now();
    const index = pickedItems.findIndex(item => item.code === code); 

    if (index !== -1) {
      // 第二次点击：将其时间戳设为 1 (远古时间)，让 loadData 过滤掉 (消失)
      pickedItems[index].timestamp = 1; 
      
    } else {
      // 第一次点击：加入列表（显示为灰色）
      pickedItems.push({ code: code, timestamp: now });
    }

    config.pickedItems = pickedItems;
    Storage.set(PICKUP_CONFIG_KEY, config);

    Widget.reloadAll();
  }
});


// 🚀 Intent 4: 一键清空所有待取包裹
export const MarkAllPickedIntent = AppIntentManager.register({
  name: "MarkAllPickedIntent",
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_: void) => {
    const storedCfg = Storage.get<PickupConfig>(PICKUP_CONFIG_KEY);
    const config: PickupConfig = storedCfg || { importedMessages: [], pickedItems: [] };
    const importedMessages = Array.isArray(config.importedMessages) ? config.importedMessages : [];
    let pickedItems = Array.isArray(config.pickedItems) ? config.pickedItems : [];
    
    const allActiveCodes = importedMessages
      .flatMap(message => extractPickupFromText(message))
      .map(item => item.code)
      .filter((code, index, codes) => codes.indexOf(code) === index);
    
    const codesToMark = allActiveCodes;
    const existingCodes = new Set(pickedItems.map(item => item.code));
    
    // 将所有活跃但未标记的 codes 添加到 pickedItems，并设置消失时间戳 (1)
    codesToMark.forEach(code => {
        if (!existingCodes.has(code)) {
            pickedItems.push({ code: code, timestamp: 1 });
        }
    });

    config.pickedItems = pickedItems;
    Storage.set(PICKUP_CONFIG_KEY, config);

    Widget.reloadAll();
  }
});
