using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Windows.Forms;

namespace YB_AIManager
{
    public partial class MainForm : Form
    {
        private List<ProjectInfo> projects = new List<ProjectInfo>();
        private string configFilePath;
        private string logFilePath;

        // 启动模式
        private enum LaunchMode
        {
            SelfPackaged,   // yb-ai-backend.exe（nexe 打包的独立 exe）
            PortableNode,   // nodejs/node.exe + dist/cli.js
            SystemNode      // 系统 PATH 中的 node + dist/cli.js
        }

        public MainForm()
        {
            InitializeComponent();
            configFilePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "projects.json");
            logFilePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "manager-log.txt");
        }

        private void Log(string message)
        {
            try
            {
                string logMessage = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}";
                File.AppendAllText(logFilePath, logMessage + Environment.NewLine);
            }
            catch { }
        }

        private void MainForm_Load(object? sender, EventArgs e)
        {
            LoadProjects();
            RefreshProjectList();
            UpdateStatusBar();
        }

        /// <summary>检测当前可用的启动模式</summary>
        private (LaunchMode mode, string? nodeExe, string? cliPath, string? backendExe) DetectLaunchMethod()
        {
            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string? nodeExe = null;
            string? cliPath = null;
            string? backendExe = null;

            // Mode 3: 自打包后端 yb-ai-backend.exe
            string selfExe = Path.Combine(appDir, "yb-ai-backend.exe");
            if (File.Exists(selfExe))
            {
                backendExe = selfExe;
                Log($"[检测] 找到自打包后端: {selfExe}");
                return (LaunchMode.SelfPackaged, null, null, backendExe);
            }

            // 后备：上两级目录（处理 exe 在 ui/bin/.../publish 的情况）
            string selfExe2 = Path.Combine(appDir, "..", "yb-ai-backend.exe");
            if (File.Exists(selfExe2))
            {
                backendExe = Path.GetFullPath(selfExe2);
                Log($"[检测] 找到自打包后端 (备选): {backendExe}");
                return (LaunchMode.SelfPackaged, null, null, backendExe);
            }

            // Mode 1: 便携 node
            string portableNode = Path.Combine(appDir, "nodejs", "node.exe");
            string portableCli = Path.Combine(appDir, "dist", "cli.js");
            if (File.Exists(portableNode) && File.Exists(portableCli))
            {
                nodeExe = portableNode;
                cliPath = portableCli;
                Log($"[检测] 便携模式: node={portableNode}");
                return (LaunchMode.PortableNode, nodeExe, cliPath, null);
            }

            // 后备：上两级目录
            string portableNode2 = Path.Combine(appDir, "..", "nodejs", "node.exe");
            string portableCli2 = Path.Combine(appDir, "..", "dist", "cli.js");
            if (File.Exists(portableNode2) && File.Exists(portableCli2))
            {
                nodeExe = Path.GetFullPath(portableNode2);
                cliPath = Path.GetFullPath(portableCli2);
                Log($"[检测] 便携模式 (备选): node={nodeExe}");
                return (LaunchMode.PortableNode, nodeExe, cliPath, null);
            }

            // Mode 2: 系统 node
            // 先检查 cli.js 是否在 appDir 同级
            string sysCli1 = Path.Combine(appDir, "dist", "cli.js");
            string sysCli2 = Path.Combine(appDir, "..", "dist", "cli.js");
            if (File.Exists(sysCli1)) cliPath = sysCli1;
            else if (File.Exists(sysCli2)) cliPath = Path.GetFullPath(sysCli2);

            if (cliPath != null)
            {
                // 查找系统 node
                string? sysNode = FindSystemNode();
                if (sysNode != null)
                {
                    nodeExe = sysNode;
                    Log($"[检测] 系统 Node 模式: node={sysNode}");
                    return (LaunchMode.SystemNode, nodeExe, cliPath, null);
                }
            }

            // 全都没找到
            Log("[检测] ❌ 没有找到任何可用的启动方式");
            return (LaunchMode.PortableNode, null, null, null);
        }

        /// <summary>从 PATH 或常见位置查找系统 node.exe</summary>
        private string? FindSystemNode()
        {
            // 1. 从 PATH 查
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "where",
                    Arguments = "node.exe",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    CreateNoWindow = true
                };
                using var proc = Process.Start(psi);
                if (proc != null)
                {
                    string output = proc.StandardOutput.ReadToEnd().Trim();
                    proc.WaitForExit(3000);
                    if (proc.ExitCode == 0 && !string.IsNullOrEmpty(output))
                    {
                        string firstLine = output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)[0];
                        return firstLine;
                    }
                }
            }
            catch { }

            // 2. 常见安装路径
            string[] commonPaths = new[]
            {
                @"C:\Program Files\nodejs\node.exe",
                @"C:\Program Files (x86)\nodejs\node.exe",
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "fnm", "node-versions"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "nvm"),
            };

            foreach (var basePath in commonPaths)
            {
                if (Directory.Exists(basePath))
                {
                    var exe = FindNodeRecursive(basePath);
                    if (exe != null) return exe;
                }
            }

            return null;
        }

        private string? FindNodeRecursive(string dir)
        {
            try
            {
                string exe = Path.Combine(dir, "node.exe");
                if (File.Exists(exe)) return exe;
                foreach (var sub in Directory.GetDirectories(dir))
                {
                    var found = FindNodeRecursive(sub);
                    if (found != null) return found;
                }
            }
            catch { }
            return null;
        }

        /// <summary>更新状态栏显示当前模式</summary>
        private void UpdateStatusBar()
        {
            var (mode, nodeExe, cliPath, backendExe) = DetectLaunchMethod();

            string modeText;
            Color modeColor;

            switch (mode)
            {
                case LaunchMode.SelfPackaged:
                    modeText = "自打包后端模式";
                    modeColor = Color.Green;
                    break;
                case LaunchMode.PortableNode:
                    modeText = "便携 Node 模式";
                    modeColor = Color.DodgerBlue;
                    break;
                case LaunchMode.SystemNode:
                    modeText = "系统 Node 模式";
                    modeColor = Color.Orange;
                    break;
                default:
                    modeText = "未检测到运行环境";
                    modeColor = Color.Red;
                    break;
            }

            if (lblStatus != null)
            {
                lblStatus.Text = $"🟢 {modeText}";
                lblStatus.ForeColor = modeColor;
            }
        }

        private void LoadProjects()
        {
            if (File.Exists(configFilePath))
            {
                try
                {
                    string json = File.ReadAllText(configFilePath);
                    projects = JsonSerializer.Deserialize<List<ProjectInfo>>(json) ?? new List<ProjectInfo>();
                }
                catch
                {
                    projects = new List<ProjectInfo>();
                }
            }
        }

        private void SaveProjects()
        {
            try
            {
                string json = JsonSerializer.Serialize(projects, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(configFilePath, json);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"保存项目配置失败: " + ex.Message, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void RefreshProjectList()
        {
            panelProjects.Controls.Clear();
            int y = 10;

            foreach (var project in projects)
            {
                Panel projectPanel = new Panel
                {
                    Width = panelProjects.ClientSize.Width - 20,
                    Height = 60,
                    Location = new Point(10, y),
                    BorderStyle = BorderStyle.FixedSingle,
                    BackColor = Color.White
                };

                Label lblName = new Label
                {
                    Text = project.Name,
                    Font = new Font("Microsoft YaHei UI", 10F, FontStyle.Bold),
                    Location = new Point(10, 8),
                    AutoSize = true
                };

                Label lblPath = new Label
                {
                    Text = Path.GetFileName(project.UprojectPath),
                    Font = new Font("Microsoft YaHei UI", 8F),
                    ForeColor = Color.Gray,
                    Location = new Point(10, 32),
                    AutoSize = true
                };

                Button btnRun = new Button
                {
                    Text = "▶ 运行",
                    Font = new Font("Microsoft YaHei UI", 9F),
                    Size = new Size(80, 35),
                    Location = new Point(projectPanel.Width - 100, 12),
                    BackColor = Color.FromArgb(0, 122, 204),
                    ForeColor = Color.White,
                    FlatStyle = FlatStyle.Flat,
                    Tag = project
                };
                btnRun.Click += BtnRun_Click;

                Button btnEdit = new Button
                {
                    Text = "✏️",
                    Font = new Font("Microsoft YaHei UI", 9F),
                    Size = new Size(35, 35),
                    Location = new Point(projectPanel.Width - 140, 12),
                    FlatStyle = FlatStyle.Flat,
                    Tag = project
                };
                btnEdit.Click += BtnEdit_Click;

                Button btnDelete = new Button
                {
                    Text = "🗑️",
                    Font = new Font("Microsoft YaHei UI", 9F),
                    Size = new Size(35, 35),
                    Location = new Point(projectPanel.Width - 180, 12),
                    FlatStyle = FlatStyle.Flat,
                    Tag = project
                };
                btnDelete.Click += BtnDelete_Click;

                projectPanel.Controls.Add(lblName);
                projectPanel.Controls.Add(lblPath);
                projectPanel.Controls.Add(btnRun);
                projectPanel.Controls.Add(btnEdit);
                projectPanel.Controls.Add(btnDelete);

                panelProjects.Controls.Add(projectPanel);
                y += 70;
            }
        }

        private void btnAddProject_Click(object? sender, EventArgs e)
        {
            using (var form = new ProjectForm())
            {
                if (form.ShowDialog() == DialogResult.OK)
                {
                    projects.Add(form.Project);
                    SaveProjects();
                    RefreshProjectList();
                }
            }
        }

        private void BtnEdit_Click(object? sender, EventArgs e)
        {
            if (sender is Button btn && btn.Tag is ProjectInfo project)
            {
                using (var form = new ProjectForm(project))
                {
                    if (form.ShowDialog() == DialogResult.OK)
                    {
                        int index = projects.IndexOf(project);
                        if (index >= 0)
                        {
                            projects[index] = form.Project;
                            SaveProjects();
                            RefreshProjectList();
                        }
                    }
                }
            }
        }

        private void BtnDelete_Click(object? sender, EventArgs e)
        {
            if (sender is Button btn && btn.Tag is ProjectInfo project)
            {
                var result = MessageBox.Show($"确定要删除项目 \"{project.Name}\" 吗？", "确认删除", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
                if (result == DialogResult.Yes)
                {
                    projects.Remove(project);
                    SaveProjects();
                    RefreshProjectList();
                }
            }
        }

        private void BtnRun_Click(object? sender, EventArgs e)
        {
            if (sender is Button btn && btn.Tag is ProjectInfo project)
            {
                if (!File.Exists(project.UprojectPath))
                {
                    string msg = $"项目文件不存在: " + project.UprojectPath;
                    Log(msg);
                    MessageBox.Show(msg, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                string workingDir = Path.GetDirectoryName(project.UprojectPath) ?? AppDomain.CurrentDomain.BaseDirectory;
                var (mode, nodeExe, cliPath, backendExe) = DetectLaunchMethod();

                Log($"工作目录: {workingDir}");
                Log($"启动模式: {mode}");

                try
                {
                    ProcessStartInfo psi;

                    if (mode == LaunchMode.SelfPackaged && backendExe != null)
                    {
                        // === 模式3：自打包后端 ===
                        psi = new ProcessStartInfo
                        {
                            FileName = backendExe,
                            WorkingDirectory = workingDir,
                            UseShellExecute = true,
                            CreateNoWindow = false
                        };
                        Log($"自打包后端: {backendExe}");
                    }
                    else if ((mode == LaunchMode.PortableNode || mode == LaunchMode.SystemNode) && nodeExe != null && cliPath != null)
                    {
                        // === 模式1/2：node + cli.js ===
                        psi = new ProcessStartInfo
                        {
                            FileName = nodeExe,
                            Arguments = $"\"{cliPath}\"",
                            WorkingDirectory = workingDir,
                            UseShellExecute = true,
                            CreateNoWindow = false
                        };
                        Log($"{nodeExe} \"{cliPath}\"");
                    }
                    else
                    {
                        string msg = $"未检测到可用的运行环境！\n\n" +
                                     $"请确保以下任一项存在：\n" +
                                     $"1. yb-ai-backend.exe（自打包后端）\n" +
                                     $"2. nodejs/node.exe + dist/cli.js（便携模式）\n" +
                                     $"3. 系统已安装 Node.js（系统 Node 模式）\n\n" +
                                     $"当前目录: {AppDomain.CurrentDomain.BaseDirectory}";
                        Log(msg);
                        MessageBox.Show(msg, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                        return;
                    }

                    Log("正在启动进程...");
                    Process.Start(psi);
                    Log("进程已启动！");
                }
                catch (Exception ex)
                {
                    string msg = $"启动失败: {ex.Message}\n{ex.StackTrace}";
                    Log(msg);
                    MessageBox.Show(msg, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
        }

        private void txtCopyText_MouseClick(object? sender, MouseEventArgs e)
        {
            txtCopyText.SelectAll();
            Clipboard.SetText(txtCopyText.Text);
            MessageBox.Show("已复制到剪贴板！", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
    }
}
