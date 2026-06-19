namespace YB_AIManager
{
    partial class MainForm
    {
        private System.ComponentModel.IContainer components = null;
        private System.Windows.Forms.Panel panelProjects;
        private System.Windows.Forms.Button btnAddProject;
        private System.Windows.Forms.Label labelTitle;
        private System.Windows.Forms.Label lblStatus;
        private System.Windows.Forms.TextBox txtCopyText;
        private System.Windows.Forms.Label labelReminder;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            this.panelProjects = new System.Windows.Forms.Panel();
            this.btnAddProject = new System.Windows.Forms.Button();
            this.labelTitle = new System.Windows.Forms.Label();
            this.txtCopyText = new System.Windows.Forms.TextBox();
            this.labelReminder = new System.Windows.Forms.Label();
            this.SuspendLayout();
            // 
            // panelProjects
            // 
            this.panelProjects.Anchor = ((System.Windows.Forms.AnchorStyles)((((System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Bottom) 
            | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.panelProjects.AutoScroll = true;
            this.panelProjects.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            this.panelProjects.Location = new System.Drawing.Point(20, 60);
            this.panelProjects.Name = "panelProjects";
            this.panelProjects.Size = new System.Drawing.Size(760, 420);
            this.panelProjects.TabIndex = 0;
            // 
            // btnAddProject
            // 
            this.btnAddProject.Font = new System.Drawing.Font("Microsoft YaHei UI", 12F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(134)));
            this.btnAddProject.Location = new System.Drawing.Point(20, 490);
            this.btnAddProject.Name = "btnAddProject";
            this.btnAddProject.Size = new System.Drawing.Size(120, 40);
            this.btnAddProject.TabIndex = 1;
            this.btnAddProject.Text = "+ 新建项目";
            this.btnAddProject.UseVisualStyleBackColor = true;
            this.btnAddProject.Click += new System.EventHandler(this.btnAddProject_Click);
            // 
            // labelTitle
            // 
            this.labelTitle.AutoSize = true;
            this.labelTitle.Font = new System.Drawing.Font("Microsoft YaHei UI", 16F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(134)));
            this.labelTitle.Location = new System.Drawing.Point(20, 20);
            this.labelTitle.Name = "labelTitle";
            this.labelTitle.Size = new System.Drawing.Size(280, 28);
            this.labelTitle.TabIndex = 2;
            this.labelTitle.Text = "YB-AI 项目管理器";
            // 
            // lblStatus
            // 
            this.lblStatus.AutoSize = true;
            this.lblStatus.Font = new System.Drawing.Font("Microsoft YaHei UI", 9F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(134)));
            this.lblStatus.Location = new System.Drawing.Point(600, 20);
            this.lblStatus.Name = "lblStatus";
            this.lblStatus.Size = new System.Drawing.Size(100, 28);
            this.lblStatus.TabIndex = 5;
            this.lblStatus.Text = "检测中...";
            this.lblStatus.TextAlign = System.Drawing.ContentAlignment.MiddleRight;
            // 
            // txtCopyText
            // 
            this.txtCopyText.Anchor = ((System.Windows.Forms.AnchorStyles)(((System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left) 
            | System.Windows.Forms.AnchorStyles.Right)));
            this.txtCopyText.Font = new System.Drawing.Font("Consolas", 10F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.txtCopyText.Location = new System.Drawing.Point(20, 570);
            this.txtCopyText.Name = "txtCopyText";
            this.txtCopyText.ReadOnly = true;
            this.txtCopyText.Size = new System.Drawing.Size(760, 23);
            this.txtCopyText.TabIndex = 3;
            this.txtCopyText.Text = "ModelContextProtocol.StartServer";
            this.txtCopyText.MouseClick += new System.Windows.Forms.MouseEventHandler(this.txtCopyText_MouseClick);
            // 
            // labelReminder
            // 
            this.labelReminder.Anchor = ((System.Windows.Forms.AnchorStyles)((System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left)));
            this.labelReminder.AutoSize = true;
            this.labelReminder.Font = new System.Drawing.Font("Microsoft YaHei UI", 9F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(134)));
            this.labelReminder.ForeColor = System.Drawing.Color.DarkOrange;
            this.labelReminder.Location = new System.Drawing.Point(20, 545);
            this.labelReminder.Name = "labelReminder";
            this.labelReminder.Size = new System.Drawing.Size(420, 17);
            this.labelReminder.TabIndex = 4;
            this.labelReminder.Text = "请先在虚幻引擎内部启动服务（点击文本框可复制命令）";
            // 
            // MainForm
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(6F, 12F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(800, 610);
            this.Controls.Add(this.lblStatus);
            this.Controls.Add(this.labelReminder);
            this.Controls.Add(this.txtCopyText);
            this.Controls.Add(this.labelTitle);
            this.Controls.Add(this.btnAddProject);
            this.Controls.Add(this.panelProjects);
            this.MinimumSize = new System.Drawing.Size(600, 500);
            this.Name = "MainForm";
            this.Text = "YB-AI 项目管理器";
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            this.Load += new System.EventHandler(this.MainForm_Load);
            this.ResumeLayout(false);
            this.PerformLayout();

        }
    }
}
