import { useStore } from '../store';
import { useCloud } from '../lib/cloud';

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < day * 7) return `${Math.floor(diff / day)} 天前`;
  const date = new Date(timestamp);
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

export default function MapList() {
  const docs = useStore((state) => state.docs);
  const currentId = useStore((state) => state.currentId);
  const cloudUser = useCloud((state) => state.user);
  const list = Object.values(docs).sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="map-list">
      <button type="button" className="new-map-btn" onClick={() => useStore.getState().newMap()}>
        <span className="plus">+</span> 新建导图
      </button>

      <div className="map-items">
        {list.map((doc) => (
          <div
            key={doc.id}
            className={`map-item${doc.id === currentId ? ' active' : ''}`}
            onClick={() => useStore.getState().openMap(doc.id)}
          >
            <div className="map-item-main">
              <span className="map-item-title">{doc.title.trim() || '未命名导图'}</span>
              <span className="map-item-time">{relativeTime(doc.updatedAt)}</span>
            </div>
            <button
              type="button"
              className="map-item-delete"
              title="删除导图"
              onClick={(event) => {
                event.stopPropagation();
                if (window.confirm(`删除「${doc.title.trim() || '未命名导图'}」？此操作不可恢复。`)) {
                  useStore.getState().removeMap(doc.id);
                }
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="map-list-foot">
        {cloudUser ? '已同步云端 · 多设备可用' : '本地保存 · 数据不出浏览器'}
      </div>
    </div>
  );
}
