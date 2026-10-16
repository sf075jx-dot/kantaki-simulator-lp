import json
import os
import sys
import shutil
import zipfile
import urllib.request
import platform
import webview
import traceback

# --- バージョン管理・アップデート関連 ---
CURRENT_VERSION = "1.0.0"  
VERSION_URL = "https://raw.githubusercontent.com/sf075jx-dot/kantaki-simulator-lp/main/version.json"
UPDATE_ZIP_URL = "https://github.com/sf075jx-dot/kantaki-simulator-lp/releases/latest/download/web.zip"

def get_app_data_dir():
    """
    OSに応じて、設定ファイルやアップデート版webフォルダを保存する適切なディレクトリを返す。
    - Windows (Frozen): exeと同じ階層
    - Mac (Frozen): ~/Library/Application Support/KantakiSimulator
    - 開発中 (共通): スクリプトと同じ階層
    """
    if getattr(sys, 'frozen', False):
        if platform.system() == 'Darwin':  # macOSの場合
            base_dir = os.path.expanduser('~/Library/Application Support')
            app_dir = os.path.join(base_dir, 'KantakiSimulator')
        else:  # Windows等の場合
            app_dir = os.path.dirname(sys.executable)
    else:
        app_dir = os.path.dirname(os.path.abspath(__file__))
    
    os.makedirs(app_dir, exist_ok=True)
    return app_dir

def get_writable_config_path():
    return os.path.join(get_app_data_dir(), 'config.json')

def get_local_version_path():
    return os.path.join(get_app_data_dir(), 'local_version.json')

def get_current_active_version():
    writable_path = get_local_version_path()
    if os.path.exists(writable_path):
        try:
            with open(writable_path, 'r', encoding='utf-8') as f:
                data = json.loads(f.read())
                return data.get("version", CURRENT_VERSION)
        except Exception:
            pass
    return CURRENT_VERSION

def save_local_version(version_str):
    local_path = get_local_version_path()
    try:
        with open(local_path, 'w', encoding='utf-8') as f:
            json.dump({"version": version_str}, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"ローカルバージョンの保存に失敗しました: {e}")

def check_and_update_web():
    app_data_dir = get_app_data_dir()
    active_version = get_current_active_version()
    
    try:
        print(f"アップデートを確認中... (現在適用中: {active_version})")
        req = urllib.request.Request(VERSION_URL, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode('utf-8'))
            latest_version = data.get("version")
            
        if latest_version and latest_version != active_version:
            print(f"新しいバージョンが見つかりました: {latest_version} (適用中: {active_version})")
            
            zip_path = os.path.join(app_data_dir, "web_update.zip")
            urllib.request.urlretrieve(UPDATE_ZIP_URL, zip_path)
            
            target_web_dir = os.path.join(app_data_dir, "web")
            if os.path.exists(target_web_dir):
                try:
                    shutil.rmtree(target_web_dir)
                    print("古いwebフォルダを削除しました。")
                except Exception as e:
                    print(f"古いwebフォルダの削除に失敗しました: {e}")

            os.makedirs(target_web_dir, exist_ok=True)
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(target_web_dir)
                
            if os.path.exists(zip_path):
                os.remove(zip_path)
                
            save_local_version(latest_version)
            print("UIのアップデートが完了しました。")
            return True, latest_version
            
    except Exception as e:
        print("--- アップデート処理中にエラーが発生しました ---")
        traceback.print_exc()
        print(f"詳細: {e}")
    
    return False, active_version

def load_config():
    writable_path = get_writable_config_path()
    if os.path.exists(writable_path):
        try:
            with open(writable_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_config(new_config):
    writable_path = get_writable_config_path()
    with open(writable_path, 'w', encoding='utf-8') as f:
        json.dump(new_config, f, ensure_ascii=False, indent=2)

class Api:
    def get_config(self):
        return load_config()

    def get_version(self):
        return {"version": get_current_active_version()}

    def update_config(self, new_config):
        try:
            save_config(new_config)
            return {"success": True, "message": "設定を保存しました。"}
        except Exception as e:
            return {"success": False, "message": str(e)}

def on_loaded():
    global updated_flag, new_ver_name
    if updated_flag:
        window.evaluate_js(f"alert('最新バージョン ({new_ver_name}) へのアップデートが完了しました！');")

if __name__ == '__main__':
    updated_flag, new_ver_name = check_and_update_web()
    
    api = Api()
    app_data_dir = get_app_data_dir()
    
    # 優先順位1：動的に更新される外部の web/index.html
    html_path = os.path.abspath(os.path.join(app_data_dir, 'web', 'index.html'))
    
    # 優先順位2：外側にまだない場合、アプリバンドル（またはMEIPASS）内の初期フォルダを見る
    if not os.path.exists(html_path) and getattr(sys, 'frozen', False):
        if platform.system() == 'Darwin':
            # Macの場合: KantakiSimulator.app/Contents/Resources/web/index.html など
            bundle_path = os.path.abspath(os.path.join(os.path.dirname(sys.executable), '..', 'Resources', 'web', 'index.html'))
            if os.path.exists(bundle_path):
                html_path = bundle_path
        else:
            # Windowsの場合: _internal/web/index.html
            internal_path = os.path.abspath(os.path.join(app_data_dir, '_internal', 'web', 'index.html'))
            if os.path.exists(internal_path):
                html_path = internal_path

        # それもない場合のMEIPASSフォールバック
        if not os.path.exists(html_path) and hasattr(sys, '_MEIPASS'):
            fallback_path = os.path.abspath(os.path.join(sys._MEIPASS, 'web', 'index.html'))
            if os.path.exists(fallback_path):
                html_path = fallback_path

    window = webview.create_window(
        'かんたき あんしん料金なび',
        url=html_path,
        js_api=api,
        width=1280,
        height=850,
        resizable=True,
        maximized=True
    )
    
    window.events.loaded += on_loaded
    
    webview.start(http_server=True)